const { createApp, ref, computed, onMounted, nextTick, reactive } = Vue;

const canvasWidth = 2000;
const canvasHeight = 4000;
const ROWS = 500;
const COLS = 200;

// 定义字符集映射
const CHAR_STYLES = {
    normal: { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' },
    bold: { h: '━', v: '┃', tl: '┏', tr: '┓', bl: '┗', br: '┛' },
    double: { h: '═', v: '║', tl: '╔', tr: '╗', bl: '╚', br: '╝' }
};

const DIR_MAP = {
    // 单线 (Weight 1)
    '─': { t: 0, b: 0, l: 1, r: 1 }, '│': { t: 1, b: 1, l: 0, r: 0 },
    '┌': { t: 0, b: 1, l: 0, r: 1 }, '┐': { t: 0, b: 1, l: 1, r: 0 },
    '└': { t: 1, b: 0, l: 0, r: 1 }, '┘': { t: 1, b: 0, l: 1, r: 0 },
    '├': { t: 1, b: 1, l: 0, r: 1 }, '┤': { t: 1, b: 1, l: 1, r: 0 },
    '┬': { t: 0, b: 1, l: 1, r: 1 }, '┴': { t: 1, b: 0, l: 1, r: 1 },
    '┼': { t: 1, b: 1, l: 1, r: 1 },

    // 粗线 (Weight 2)
    '━': { t: 0, b: 0, l: 2, r: 2 }, '┃': { t: 2, b: 2, l: 0, r: 0 },
    '┏': { t: 0, b: 2, l: 0, r: 2 }, '┓': { t: 0, b: 2, l: 2, r: 0 },
    '┗': { t: 2, b: 0, l: 0, r: 2 }, '┛': { t: 2, b: 0, l: 2, r: 0 },
    '┣': { t: 2, b: 2, l: 0, r: 2 }, '┫': { t: 2, b: 2, l: 2, r: 0 },
    '┳': { t: 0, b: 2, l: 2, r: 2 }, '┻': { t: 2, b: 0, l: 2, r: 2 },
    '╋': { t: 2, b: 2, l: 2, r: 2 },

    // 双线 (Weight 3)
    '═': { t: 0, b: 0, l: 3, r: 3 }, '║': { t: 3, b: 3, l: 0, r: 0 },
    '╔': { t: 0, b: 3, l: 0, r: 3 }, '╗': { t: 0, b: 3, l: 3, r: 0 },
    '╚': { t: 3, b: 0, l: 0, r: 3 }, '╝': { t: 3, b: 0, l: 3, r: 0 },
    '╠': { t: 3, b: 3, l: 0, r: 3 }, '╣': { t: 3, b: 3, l: 3, r: 0 },
    '╦': { t: 0, b: 3, l: 3, r: 3 }, '╩': { t: 3, b: 0, l: 3, r: 3 },
    '╬': { t: 3, b: 3, l: 3, r: 3 },

    ' ': { t: 0, b: 0, l: 0, r: 0 }
};

const CHAR_TABLE = {
    // --- 纯单线 (1) ---
    "1100": "│", "0011": "─", "0101": "┌", "0110": "┐", "1001": "└", "1010": "┘",
    "1111": "┼", "0111": "┬", "1011": "┴", "1101": "├", "1110": "┤",

    // --- 纯粗线 (2) ---
    "2200": "┃", "0022": "━", "0202": "┏", "0220": "┓", "2002": "┗", "2020": "┛",
    "2222": "╋", "0222": "┳", "2222": "┻", "2202": "┣", "2220": "┫",

    // --- 纯双线 (3) ---
    "3300": "║", "0033": "═", "0303": "╔", "0330": "╗", "3003": "╚", "3030": "╝",
    "3333": "╬", "0333": "╦", "3333": "╩", "3303": "╠", "3330": "╣",

    // --- 粗 (2) 与 细 (1) 混合 ---
    "1122": "┿", // 竖细横粗
    "2211": "╂", // 竖粗横细
    "2221": "╊", "2212": "╉", "2122": "╈", "1222": "╇", // 各种粗细混合交叉

    // --- 双线 (3) 与 细线 (1) 混合 ---
    "3311": "╫", // 竖双横单
    "1133": "╪", // 竖单横双
    "0311": "╥", "3011": "╨", "1103": "╞", "1130": "╡",
    "0133": "╤", "1033": "╧", "3301": "╟", "3310": "╢",

    // --- 重点：双线 (3) 与 粗线 (2) 混合 ---
    // 策略：由于没有专门字符，统一映射到双线交叉，确保不出现 undefined
    "3322": "╬", // 竖双横粗 -> 升级为双线交叉
    "2233": "╬", // 竖粗横双 -> 升级为双线交叉
    "0322": "╦", // 顶无, 下双, 左右粗 -> 升级为双线 T 字
    "3022": "╩",
    "3302": "╠",
    "3320": "╣",
    "2203": "╠",
    "2230": "╣"
};

function merge(newChar, existingChar) {
    if (newChar === ' ') return existingChar;
    if (existingChar === ' ') return newChar;

    const d1 = DIR_MAP[newChar] || { t: 0, b: 0, l: 0, r: 0 };
    const d2 = DIR_MAP[existingChar] || { t: 0, b: 0, l: 0, r: 0 };

    // 核心：取每个方向的最强连接强度
    const t = Math.max(d1.t, d2.t);
    const b = Math.max(d1.b, d2.b);
    const l = Math.max(d1.l, d2.l);
    const r = Math.max(d1.r, d2.r);
    const key = `${t}${b}${l}${r}`;
    const override = CHAR_TABLE[key];
    console.log(`Merging '${newChar}' with '${existingChar}' => '${override}', key=${key}`);
    return override || newChar;
}

// 创建二维字符缓冲区：
function createBuffer() {
    return Array(ROWS).fill().map(() => Array(COLS).fill(' '));
}

// 基础图形类：
class Shape {
    static #nextId = 0;

    constructor(type, x, y) {
        this.id = ++Shape.#nextId;
        this.type = type;
        this.x = x;
        this.y = y;
        this.style = 'normal';
        this.name = this.type + ' ' + this.id;
    }

    // 命中检测：子类需实现：
    isHit(gx, gy) { return false; }

    // 写入缓冲区：子类需实现：
    draw(buffer) { }

    // 返回 UI 遮罩范围：用于选择框
    getBounds() { return { x: this.x, y: this.y, w: 1, h: 1 }; }
}

// 矩形类：
class Rectangle extends Shape {

    constructor(x, y, w, h, transparent = true) {
        super('Rect', x, y);
        this.w = w;
        this.h = h;
        this.transparent = transparent;
    }

    isHit(gx, gy) {
        return gx >= this.x && gx < this.x + this.w && gy >= this.y && gy < this.y + this.h;
    }

    getBounds() {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    draw(buffer) {
        const charset = CHAR_STYLES[this.style];

        for (let i = 0; i < this.h; i++) {
            for (let j = 0; j < this.w; j++) {
                const ty = this.y + i;
                const tx = this.x + j;
                if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) continue;

                // 判断是否是边缘：
                const isTop = i === 0;
                const isBottom = i === this.h - 1;
                const isLeft = j === 0;
                const isRight = j === this.w - 1;
                const isEdge = isTop || isBottom || isLeft || isRight;

                // 如果是透明模式且不是边缘，则跳过不绘制（不改写 buffer）：
                if (this.transparent && !isEdge) {
                    continue;
                }

                let char = ' ';
                if (isTop && isLeft) char = charset.tl;
                else if (isTop && isRight) char = charset.tr;
                else if (isBottom && isLeft) char = charset.bl;
                else if (isBottom && isRight) char = charset.br;
                else if (isTop || isBottom) char = charset.h;
                else if (isLeft || isRight) char = charset.v;

                // 智能交叉融合：感知底层字符
                const existing = buffer[ty][tx];
                buffer[ty][tx] = merge(char, existing);
            }
        }
    }
}

// 直线类 (目前支持简单正交线或斜线)
class Line extends Shape {
    constructor(x1, y1, x2, y2) {
        super('Line', x1, y1);
        this.x2 = x2;
        this.y2 = y2;
    }

    isHit(gx, gy) {
        // 简单的包围盒碰撞 (实际开发中可以用点到线段距离，但 ASCII 点击较宽松即可)
        const minX = Math.min(this.x, this.x2);
        const maxX = Math.max(this.x, this.x2);
        const minY = Math.min(this.y, this.y2);
        const maxY = Math.max(this.y, this.y2);
        return gx >= minX && gx <= maxX && gy >= minY && gy <= maxY;
    }

    getBounds() {
        return {
            x: Math.min(this.x, this.x2),
            y: Math.min(this.y, this.y2),
            w: Math.abs(this.x2 - this.x) + 1,
            h: Math.abs(this.y2 - this.y) + 1
        };
    }

    draw(buffer) {
        let x = this.x;
        let y = this.y;
        const dx = Math.abs(this.x2 - x);
        const dy = Math.abs(this.y2 - y);
        const sx = (x < this.x2) ? 1 : -1;
        const sy = (y < this.y2) ? 1 : -1;
        let err = dx - dy;

        const charset = CHAR_STYLES[this.style];

        while (true) {
            if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
                // 根据 style 获取基本字符
                let char = '*';
                if (dx === 0) char = charset.v;
                else if (dy === 0) char = charset.h;

                // 重点：使用 merge 写入 buffer
                const existing = buffer[y][x];
                buffer[y][x] = merge(char, existing);
            }
            if (x === this.x2 && y === this.y2) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
        }
    }
}

createApp({
    setup() {
        // 响应式状态，存储测量后的精确数值
        const config = reactive({
            charW: 9.6,
            charH: 24
        });

        const selectedNodeId = ref(null);
        const currentGrid = ref({ x: 0, y: 0 });

        // 使用类实例初始化节点
        const nodes = ref([
            new Rectangle(10, 5, 30, 6),
            new Rectangle(17, 8, 30, 12),
            new Rectangle(27, 3, 30, 22),
            new Line(5, 5, 5, 12),   // 垂直线
            new Line(40, 20, 60, 20) // 水平线
        ]);
        nodes.value[1].style = 'bold';
        nodes.value[2].style = 'double';

        // 计算属性：当前选中的节点对象
        const selectedNode = computed(() =>
            nodes.value.find(n => n.id === selectedNodeId.value)
        );

        // 计算属性：高亮遮罩的样式
        const selectionStyle = computed(() => {
            if (!selectedNode.value) {
                return {};
            }
            const bounds = selectedNode.value.getBounds();
            return {
                left: (bounds.x * config.charW) + 'px',
                top: (bounds.y * config.charH) + 'px',
                width: (bounds.w * config.charW) + 'px',
                height: (bounds.h * config.charH) + 'px'
            };
        });

        const screenOutput = computed(() => {
            const buffer = createBuffer();
            // 按照层级依次调用各自的 draw 方法
            nodes.value.forEach(node => {
                node.draw(buffer);
            });
            return buffer.map(row => row.join('')).join('\n');
        });

        // 处理点击选中
        const handleCanvasClick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const gx = Math.floor((e.clientX - rect.left) / config.charW);
            const gy = Math.floor((e.clientY - rect.top) / config.charH);
            currentGrid.value = { x: gx, y: gy };

            // 使用各自类定义的 isHit 逻辑
            const hit = [...nodes.value].reverse().find(node => node.isHit(gx, gy));
            selectedNodeId.value = hit ? hit.id : null;
        };

        onMounted(() => {
            // 精确测量逻辑
            const tester = document.createElement('span');
            tester.style.fontFamily = "'maple-mono'";
            tester.style.fontSize = '16px';
            tester.style.position = 'absolute';
            tester.style.visibility = 'hidden';
            tester.style.whiteSpace = 'pre';
            tester.style.letterSpacing = '0px';
            tester.style.margin = '0';
            tester.style.padding = '0';
            // 测量 500 个字符再除以 500，能极大减小亚像素误差
            tester.innerText = 'A'.repeat(500);
            document.body.appendChild(tester);

            const rect = tester.getBoundingClientRect();
            config.charW = rect.width / 500;
            config.charH = 24; // 对应 CSS 里的 line-height
            console.log(`Measured char size: ${config.charW}px x ${config.charH}px`);
            // 同步回 CSS 变量
            document.documentElement.style.setProperty('--grid-w', `${config.charW}px`);
            document.documentElement.style.setProperty('--grid-h', `${config.charH}px`);

            document.body.removeChild(tester);

            lucide.createIcons();
        });

        return {
            nodes, canvasWidth, canvasHeight, screenOutput,
            selectedNodeId, selectedNode, selectionStyle,
            handleCanvasClick, currentGrid
        };
    }
}).mount('#app');
