const { createApp, ref, computed, onMounted, nextTick, reactive } = Vue;

const canvasWidth = 2000;
const canvasHeight = 1000;
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
    "0233": "╦", // 顶无, 下粗, 左右双
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
    console.log(`Merge '${newChar}' with '${existingChar}' => '${override}', key=${key}`);
    return override || newChar;
}

/**
 * char: 当前要画的边框字符
 * existing: 缓冲区已有的字符
 * side: 'top' | 'bottom' | 'left' | 'right' | 'corner' (告知是哪条边)
 */
function mergeOpaque(newChar, existing, side) {
    if (existing === ' ') return newChar;

    const d1 = DIR_MAP[newChar] || { t: 0, b: 0, l: 0, r: 0 };
    const d2 = DIR_MAP[existing] || { t: 0, b: 0, l: 0, r: 0 };

    // 核心逻辑：只保留朝向“外部”的连线
    // 如果是左边界，就要切断底层字符向右(r)的连接
    let t = Math.max(d1.t, d2.t);
    let b = Math.max(d1.b, d2.b);
    let l = Math.max(d1.l, d2.l);
    let r = Math.max(d1.r, d2.r);

    if (side === 'left') r = 0;   // 左边框切断向右的线
    if (side === 'right') l = 0;  // 右边框切断向左的线
    if (side === 'top') b = 0;    // 上边框切断向下的线
    if (side === 'bottom') t = 0; // 下边框切断向上的线
    // 角点 corner 暂不处理或根据具体位置切断两个方向

    const key = `${t}${b}${l}${r}`;
    const override = CHAR_TABLE[key];
    console.log(`Merge opaque '${newChar}' with '${existing}' => '${override}', key=${key}`);
    return override || newChar;
}

// 创建二维字符缓冲区：
function createBuffer() {
    return Array(ROWS).fill().map(() => Array(COLS).fill(' '));
}

// 调整点的影响因子：[dx, dy, dw, dh]
// dx, dy: 是否改变位置； dw, dh: 是否改变尺寸
const RESIZE_MAP = {
    'tl': [1, 1, -1, -1], // 左上：改 x,y，同时反向改 w,h
    'tc': [0, 1, 0, -1],  // 中上：只改 y 和 h
    'tr': [0, 1, 1, -1],  // 右上：改 y, w, h
    'ml': [1, 0, -1, 0],  // 左中：改 x 和 w
    'mr': [0, 0, 1, 0],   // 右中：只改 w
    'bl': [1, 0, -1, 1],  // 左下：改 x, w, h
    'bc': [0, 0, 0, 1],   // 中下：只改 h
    'br': [0, 0, 1, 1],   // 右下：只改 w 和 h
};

/**
 * Context: 渲染上下文，携带绘图环境
 */
class Context {
    constructor(buffer, model) {
        this.buffer = buffer; // 二维数组
        this.model = model;   // 指向 Model 实例
        this.rows = buffer.length;
        this.cols = buffer[0].length;
    }
}

/**
 * Model: 存储所有图形数据和全局状态
 */
class Model {
    constructor(config) {
        this.shapes = reactive([]); // 存放 Rectangle, Line 等
        this.config = config;
    }

    findShape(id) {
        return this.shapes.find(s => s.id === id);
    }
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
        // 文本相关属性
        this.text = "";
        this.alignX = 'center'; // 'left', 'center', 'right'
        this.alignY = 'center'; // 'top', 'center', 'bottom'
        this.wrap = true;       // 是否自动折行
    }

    isHit(gx, gy) {
        return gx >= this.x && gx < this.x + this.w && gy >= this.y && gy < this.y + this.h;
    }

    getBounds() {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    // 在 Rectangle 类中添加处理文本的方法
    layoutText() {
        if (!this.text) return [];
        // 如果没有边框，填充为 0；否则为 2（左右或上下之和）
        const padding = this.style === 'none' ? 0 : 2;
        const maxWidth = this.w - padding;
        const maxHeight = this.h - padding;

        if (maxWidth <= 0 || maxHeight <= 0) return [];

        let lines = [];
        const rawSegments = this.text.split('\n');

        rawSegments.forEach(segment => {
            if (!this.wrap || segment.length <= maxWidth) {
                lines.push(segment.slice(0, maxWidth));
            } else {
                for (let i = 0; i < segment.length; i += maxWidth) {
                    lines.push(segment.slice(i, i + maxWidth));
                }
            }
        });
        return lines.slice(0, maxHeight);
    }

    draw(ctx) {
        const buffer = ctx.buffer;
        const hasBorder = this.style !== 'none';
        const charset = hasBorder ? CHAR_STYLES[this.style] : null;

        // 背景与边框绘制
        for (let i = 0; i < this.h; i++) {
            for (let j = 0; j < this.w; j++) {
                const ty = this.y + i;
                const tx = this.x + j;
                if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) continue;

                const isTop = i === 0;
                const isBottom = i === this.h - 1;
                const isLeft = j === 0;
                const isRight = j === this.w - 1;
                const isEdge = isTop || isBottom || isLeft || isRight;

                // 处理背景填充 (如果不透明且没有边框，或是透明矩形的内部)
                if (!isEdge || !hasBorder) {
                    if (!this.transparent) {
                        buffer[ty][tx] = ' ';
                    }
                    continue;
                }

                // 只有 hasBorder 时才会走到这里的边框融合逻辑
                let char = ' ';
                let side = '';
                if (isTop && isLeft) { char = charset.tl; side = 'corner'; }
                else if (isTop && isRight) { char = charset.tr; side = 'corner'; }
                else if (isBottom && isLeft) { char = charset.bl; side = 'corner'; }
                else if (isBottom && isRight) { char = charset.br; side = 'corner'; }
                else if (isTop) { char = charset.h; side = 'top'; }
                else if (isBottom) { char = charset.h; side = 'bottom'; }
                else if (isLeft) { char = charset.v; side = 'left'; }
                else if (isRight) { char = charset.v; side = 'right'; }

                const existing = buffer[ty][tx];
                if (this.transparent || side === 'corner') {
                    buffer[ty][tx] = merge(char, existing);
                } else {
                    buffer[ty][tx] = mergeOpaque(char, existing, side);
                }
            }
        }

        // 文本绘制
        const lines = this.layoutText();
        if (lines.length === 0) return;

        // 无边框时起始位置为 0，有边框时起始位置为 1
        const offset = hasBorder ? 1 : 0;
        const availableW = hasBorder ? this.w - 2 : this.w;
        const availableH = hasBorder ? this.h - 2 : this.h;

        // 计算 Y 轴起始位置 (相对于 this.y)
        let startY = offset;
        if (this.alignY === 'center') {
            startY = offset + Math.floor((availableH - lines.length) / 2);
        } else if (this.alignY === 'bottom') {
            startY = offset + (availableH - lines.length);
        }

        lines.forEach((line, index) => {
            const row = this.y + startY + index;
            // 确保文字在矩形垂直边界内
            if (row < this.y + offset || row >= this.y + offset + availableH) return;

            // 计算 X 轴起始位置 (相对于 this.x)
            let startX = offset;
            if (this.alignX === 'center') {
                startX = offset + Math.floor((availableW - line.length) / 2);
            } else if (this.alignX === 'right') {
                startX = offset + (availableW - line.length);
            }

            for (let c = 0; c < line.length; c++) {
                const col = this.x + startX + c;
                // 确保文字在矩形水平边界内
                if (col < this.x + offset || col >= this.x + offset + availableW) continue;

                if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
                    buffer[row][col] = line[c];
                }
            }
        });
    }
}

// 直线类 (目前支持简单正交线或斜线)
class Line extends Shape {
    constructor(x1, y1, x2, y2) {
        super('Line', x1, y1);
        this.x2 = x2;
        this.y2 = y2;
        this.startBinding = { nodeId: null, side: null };
        this.endBinding = { nodeId: null, side: null };
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

    // 解析端点的最终网格位置
    getEffectiveCoords(model) {
        const resolve = (point, binding) => {
            if (binding.nodeId) {
                const target = model.findShape(binding.nodeId);
                if (target && target.type === 'Rect') {
                    const { x, y, w, h } = target.getBounds();
                    switch (binding.side) {
                        case 'top': return { x: x + Math.floor(w / 2), y: y };
                        case 'bottom': return { x: x + Math.floor(w / 2), y: y + h - 1 };
                        case 'left': return { x: x, y: y + Math.floor(h / 2) };
                        case 'right': return { x: x + w - 1, y: y + Math.floor(h / 2) };
                    }
                }
            }
            return point;
        };

        const start = resolve({ x: this.x, y: this.y }, this.startBinding);
        const end = resolve({ x: this.x2, y: this.y2 }, this.endBinding);

        return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    }

    draw(ctx) {
        // 从 ctx.model 解析坐标:
        const { x1, y1, x2, y2 } = this.getEffectiveCoords(ctx.model);
        this._drawLine(ctx.buffer, x1, y1, x2, y2);
    }

    _drawLine(buffer, x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = (x1 < x2) ? 1 : -1;
        const sy = (y1 < y2) ? 1 : -1;
        let err = dx - dy;

        const charset = CHAR_STYLES[this.style];

        while (true) {
            if (y1 >= 0 && y1 < ROWS && x1 >= 0 && x1 < COLS) {
                // 根据 style 获取基本字符
                let char = '*';
                if (dx === 0) char = charset.v;
                else if (dy === 0) char = charset.h;

                // 重点：使用 merge 写入 buffer
                const existing = buffer[y1][x1];
                buffer[y1][x1] = merge(char, existing);
            }
            if (x1 === x2 && y1 === y2) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x1 += sx; }
            if (e2 < dx) { err += dx; y1 += sy; }
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

        const model = new Model(config);
        model.shapes.push(
            new Rectangle(10, 5, 30, 11),
            new Rectangle(17, 8, 30, 12),
            new Rectangle(27, 3, 30, 12),
            new Rectangle(62, 3, 29, 9),
            new Rectangle(62, 13, 29, 9),
            new Line(5, 5, 5, 12),   // 垂直线
            new Line(40, 20, 60, 20) // 水平线
        )

        model.shapes[1].style = 'bold';
        model.shapes[2].style = 'double';
        model.shapes[2].transparent = false;
        model.shapes[3].text = "Hello, ASCII Draw!\nThis is a sample text. It should wrap properly.";
        model.shapes[4].style = 'none';
        model.shapes[4].alignX = 'left';
        model.shapes[4].alignY = 'top';
        model.shapes[4].text = "Hello, ASCII Draw!\nThis is a sample text. It should wrap properly.";

        // 计算属性：当前选中的节点对象
        const selectedNode = computed(() =>
            model.shapes.find(n => n.id === selectedNodeId.value)
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
            const ctx = new Context(buffer, model);
            // 按照层级依次调用各自的 draw 方法
            model.shapes.forEach(node => {
                console.log(node);
                node.draw(ctx);
            });
            return buffer.map(row => row.join('')).join('\n');
        });

        const handlePositions = computed(() => {
            const n = selectedNode.value;
            if (!n || n.type !== 'Line') return [];

            const bounds = n.getBounds();
            const halfW = config.charW / 2;
            const halfH = config.charH / 2;

            // 计算相对于 selection-box 左上角的偏移，并加上半个字符的偏移量
            return [
                {
                    left: (n.x - bounds.x) * config.charW + halfW + 'px',
                    top: (n.y - bounds.y) * config.charH + halfH + 'px'
                },
                {
                    left: (n.x2 - bounds.x) * config.charW + halfW + 'px',
                    top: (n.y2 - bounds.y) * config.charH + halfH + 'px'
                }
            ];
        });

        const handleResizeStart = (e, handleType) => {
            e.preventDefault();
            e.stopPropagation();

            const node = selectedNode.value;
            if (!node) return;

            // 记录初始鼠标位置
            const startX = e.clientX;
            const startY = e.clientY;

            // 记录初始节点数据
            let initialData = {};
            if (node.type === 'Rect') {
                initialData = { x: node.x, y: node.y, w: node.w, h: node.h };
            } else if (node.type === 'Line') {
                initialData = { x: node.x, y: node.y, x2: node.x2, y2: node.y2 };
            }

            const onMouseMove = (moveEvent) => {
                // 计算鼠标移动的网格增量
                const deltaX = Math.round((moveEvent.clientX - startX) / config.charW);
                const deltaY = Math.round((moveEvent.clientY - startY) / config.charH);

                if (node.type === 'Rect') {
                    const map = RESIZE_MAP[handleType];
                    let newX = initialData.x + deltaX * map[0];
                    let newY = initialData.y + deltaY * map[1];
                    let newW = initialData.w + deltaX * map[2];
                    let newH = initialData.h + deltaY * map[3];

                    // 尺寸限制
                    if (newW < 2) {
                        if (map[0] === 1) newX = initialData.x + initialData.w - 2;
                        newW = 2;
                    }
                    if (newH < 2) {
                        if (map[1] === 1) newY = initialData.y + initialData.h - 2;
                        newH = 2;
                    }
                    node.x = newX; node.y = newY; node.w = newW; node.h = newH;

                } else if (node.type === 'Line') {
                    // 直线逻辑：直接更新对应端点的坐标
                    if (handleType === 'start') {
                        const targetX = initialData.x + deltaX;
                        const targetY = initialData.y + deltaY;

                        // 只要不与终点重叠即可
                        if (targetX !== node.x2 || targetY !== node.y2) {
                            node.x = targetX;
                            node.y = targetY;
                        }
                    } else if (handleType === 'end') {
                        const targetX = initialData.x2 + deltaX;
                        const targetY = initialData.y2 + deltaY;

                        // 只要不与起点重叠即可
                        if (targetX !== node.x || targetY !== node.y) {
                            node.x2 = targetX;
                            node.y2 = targetY;
                        }
                    }
                }
            };

            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };

        // 处理点击选中
        const handleCanvasClick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const gx = Math.floor((e.clientX - rect.left) / config.charW);
            const gy = Math.floor((e.clientY - rect.top) / config.charH);
            currentGrid.value = { x: gx, y: gy };

            // 使用各自类定义的 isHit 逻辑
            const hit = [...model.shapes].reverse().find(node => node.isHit(gx, gy));
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
            model, canvasWidth, canvasHeight, screenOutput,
            selectedNodeId, selectedNode, selectionStyle, config,
            handlePositions, handleResizeStart,
            handleCanvasClick, currentGrid
        };
    }
}).mount('#app');
