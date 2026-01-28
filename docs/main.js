const { createApp, ref, computed, onMounted, nextTick, reactive } = Vue;

const ROWS = 200;
const COLS = 400;

// 定义字符集映射
const CHAR_STYLES = {
    normal: { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' },
    bold: { h: '━', v: '┃', tl: '┏', tr: '┓', bl: '┗', br: '┛' },
    double: { h: '═', v: '║', tl: '╔', tr: '╗', bl: '╚', br: '╝' }
};

const ARROW_CHARS = {
    top: '▼',
    bottom: '▲',
    left: '▶',
    right: '◀'
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
    'move': [1, 1, 0, 0], // x, y 随 delta 改变，w, h 不变
};

/**
 * Context: 渲染上下文，携带绘图环境
 */
class Context {
    constructor(buffer, model) {
        this.buffer = buffer; // 二维数组
        this.model = model;   // 指向 Model 实例
    }
}

/**
 * Model: 存储所有图形数据和全局状态
 */
class Model {
    constructor(config) {
        this.shapes = reactive([]); // 存放 Rect, Line 等
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

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            style: this.style
        };
    }

    // 命中检测：子类需实现：
    isHit(gx, gy) { return false; }

    // 写入缓冲区：子类需实现：
    draw(buffer) { }

    // 返回 UI 遮罩范围：用于选择框
    getBounds(model) { return { x: this.x, y: this.y, w: 1, h: 1 }; }
}

// 矩形类：
class Rect extends Shape {

    constructor(x, y, w, h, props = {}) {
        super('Rect', x, y);
        this.w = w;
        this.h = h;

        // 默认属性:
        this.transparent = false;
        this.text = "";
        this.alignX = 'center'; // 'left', 'center', 'right'
        this.alignY = 'center'; // 'top', 'center', 'bottom'
        this.wrap = true;       // 是否自动折行

        // 合并外部传入的属性 (覆盖默认值)
        Object.assign(this, props);
    }

    toJSON() {
        let json = super.toJSON();
        json.w = this.w;
        json.h = this.h;
        json.transparent = this.transparent;
        json.text = this.text;
        json.alignX = this.alignX;
        json.alignY = this.alignY;
        json.wrap = this.wrap;
        return json;
    }

    isHit(gx, gy) {
        return gx >= this.x && gx < this.x + this.w && gy >= this.y && gy < this.y + this.h;
    }

    getBounds(model) {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    // 在 Rect 类中添加处理文本的方法
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
        console.log(JSON.stringify(this.toJSON()));
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
    constructor(x1, y1, x2, y2, props) {
        super('Line', x1, y1);
        this.x2 = x2;
        this.y2 = y2;
        this.startBinding = { nodeId: null, side: null };
        this.endBinding = { nodeId: null, side: null };
        // 样式属性
        this.startStyle = 'normal'; // 'normal' | 'arrow'
        this.endStyle = 'normal';

        // 合并外部传入的属性 (覆盖默认值)
        Object.assign(this, props);
    }

    toJSON() {
        let json = super.toJSON();
        json.x2 = this.x2;
        json.y2 = this.y2;
        json.startBinding = this.startBinding;
        json.endBinding = this.endBinding;
        json.startStyle = this.startStyle;
        json.endStyle = this.endStyle;
        return json;
    }

    isHit(gx, gy) {
        // 简单的包围盒碰撞 (实际开发中可以用点到线段距离，但 ASCII 点击较宽松即可)
        const minX = Math.min(this.x, this.x2);
        const maxX = Math.max(this.x, this.x2);
        const minY = Math.min(this.y, this.y2);
        const maxY = Math.max(this.y, this.y2);
        return gx >= minX && gx <= maxX && gy >= minY && gy <= maxY;
    }

    getBounds(model) {
        // 这里的 model 是可选的，为了兼容没有 model 传入的情况（比如刚创建时）
        const { x1, y1, x2, y2 } = model ? this.getEffectiveCoords(model) : { x1: this.x, y1: this.y, x2: this.x2, y2: this.y2 };

        return {
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            w: Math.abs(x2 - x1) + 1,
            h: Math.abs(y2 - y1) + 1
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
                        case 'top': return { x: x + Math.floor(w / 2), y: y, side: 'top' };
                        case 'bottom': return { x: x + Math.floor(w / 2), y: y + h - 1, side: 'bottom' };
                        case 'left': return { x: x, y: y + Math.floor(h / 2), side: 'left' };
                        case 'right': return { x: x + w - 1, y: y + Math.floor(h / 2), side: 'right' };
                    }
                }
            }
            return { ...point, side: null };
        };

        const start = resolve({ x: this.x, y: this.y }, this.startBinding);
        const end = resolve({ x: this.x2, y: this.y2 }, this.endBinding);

        return {
            x1: start.x, y1: start.y, startSide: start.side,
            x2: end.x, y2: end.y, endSide: end.side
        };
    }

    draw(ctx) {
        // 从 ctx.model 解析坐标:
        const { x1, y1, startSide, x2, y2, endSide } = this.getEffectiveCoords(ctx.model);
        // 实时同步：确保逻辑坐标始终等于当前的有效物理坐标
        // 这样无论矩形怎么动，Line 的手柄位置计算永远是正确的
        this.x = x1;
        this.y = y1;
        this.x2 = x2;
        this.y2 = y2;
        console.log(JSON.stringify(this.toJSON()));
        this._drawLine1(ctx.buffer, x1, y1, startSide, x2, y2, endSide);
    }

    _drawLine1(buffer, x1, y1, startSide, x2, y2, endSide) {
        console.log(`_drawLine1: (${x1},${y1}) ${startSide} to (${x2},${y2}) ${endSide}`);
        // 默认绘图起止点先同步锚点
        let drawX1 = x1, drawY1 = y1;
        let drawX2 = x2, drawY2 = y2;

        // 1. 偏移逻辑 (保护锚点)
        if (startSide) {
            if (startSide === 'top') drawY1--; // 锚点在顶，绘图从上一行开始
            if (startSide === 'bottom') drawY1++; // 锚点在底，绘图从下一行开始
            if (startSide === 'left') drawX1--; // 锚点在左，绘图从左一列开始
            if (startSide === 'right') drawX1++; // 锚点在右，绘图从右一列开始
        }

        if (endSide) {
            if (endSide === 'top') drawY2--;
            if (endSide === 'bottom') drawY2++;
            if (endSide === 'left') drawX2--;
            if (endSide === 'right') drawX2++;
        }

        // 2. 绘制主体折线
        this._drawLine2(buffer, drawX1, drawY1, drawX2, drawY2, startSide, endSide);
    }

    _drawLine2(buffer, x1, y1, x2, y2, startSide, endSide) {
        console.log(`_drawLine2: (${x1},${y1}, ${startSide}) to (${x2},${y2}, ${endSide})`);
        const charset = CHAR_STYLES[this.style];
        const points = this._calculatePath(x1, y1, x2, y2, startSide, endSide);

        // 1. 绘制直线段（跳过每段的端点，避免覆盖拐角和箭头）
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            this._drawSegment(buffer, p1.x, p1.y, p2.x, p2.y, charset);
        }

        // 2. 绘制拐角字符
        this._drawCorners(buffer, points, charset);

        // 3. 处理起点装饰
        if (this.startStyle === 'arrow') {
            const side = startSide || this._getMarkerSide(true, points[0], points[1]);
            this._drawMarker(buffer, x1, y1, side);
        } else {
            // 如果是 normal，补全起点缺失的那一格线
            this._fillGapWithLine(buffer, points[0], points[1], charset);
        }

        // 4. 处理终点装饰
        if (this.endStyle === 'arrow') {
            const side = endSide || this._getMarkerSide(false, points[points.length - 2], points[points.length - 1]);
            this._drawMarker(buffer, x2, y2, side);
        } else {
            // 如果是 normal，补全终点缺失的那一格线
            this._fillGapWithLine(buffer, points[points.length - 1], points[points.length - 2], charset);
        }
    }

    _calculatePath(x1, y1, x2, y2, startSide, endSide) {
        console.log(`_calculatePath: (${x1},${y1}, ${startSide}) to (${x2},${y2}, ${endSide})`);
        let path = [{ x: x1, y: y1 }];

        const getDir = (side) => {
            if (side === 'left') return { dx: -1, dy: 0 };
            if (side === 'right') return { dx: 1, dy: 0 };
            if (side === 'top') return { dx: 0, dy: -1 };
            if (side === 'bottom') return { dx: 0, dy: 1 };
            return null;
        };

        const sDir = getDir(startSide);
        const eDir = getDir(endSide);

        // --- 1. 尝试直接交点法 (2段 L-型) ---
        if (sDir && eDir && (sDir.dx === 0) !== (eDir.dx === 0)) {
            const intersectX = sDir.dx === 0 ? x1 : x2;
            const intersectY = sDir.dx === 0 ? y2 : y1;

            const isStartForward = sDir.dx !== 0
                ? Math.sign(intersectX - x1) === sDir.dx
                : Math.sign(intersectY - y1) === sDir.dy;

            // 核心修正：不仅要方向正确，还要保证最后一段有足够的正向空间（至少1格逃逸距离）
            const endDist = eDir.dx !== 0 ? (x2 - intersectX) * (-eDir.dx) : (y2 - intersectY) * (-eDir.dy);
            const isEndForward = endDist >= 1; // 必须从正面撞击，且距离至少为1

            if (isStartForward && isEndForward) {
                path.push({ x: intersectX, y: intersectY });
                path.push({ x: x2, y: y2 });
                const r = this._finalizePath(path);
                console.log(`_calculatePath result: ${JSON.stringify(r)}`);
                return r;
            }
        }

        // --- 2. 面对面冲突判定 (3段 vs 5段) ---
        // 如果是 Right -> Left 这种面对面
        if (startSide === 'right' && endSide === 'left') {
            if (x2 - x1 >= 2) { // 空间足够
                const midX = Math.floor((x1 + x2) / 2);
                path.push({ x: midX, y: y1 }, { x: midX, y: y2 });
            } else { // 空间不足，5段绕路
                const midY = Math.floor((y1 + y2) / 2);
                path.push({ x: x1 + 1, y: y1 }, { x: x1 + 1, y: midY }, { x: x2 - 1, y: midY }, { x: x2 - 1, y: y2 });
            }
        }
        else if (startSide === 'left' && endSide === 'right') {
            if (x1 - x2 >= 2) {
                const midX = Math.floor((x1 + x2) / 2);
                path.push({ x: midX, y: y1 }, { x: midX, y: y2 });
            } else {
                const midY = Math.floor((y1 + y2) / 2);
                path.push({ x: x1 - 1, y: y1 }, { x: x1 - 1, y: midY }, { x: x2 + 1, y: midY }, { x: x2 + 1, y: y2 });
            }
        }
        // ... 同样逻辑处理 Top/Bottom 面对面 ...
        else if (startSide === 'bottom' && endSide === 'top') {
            if (y2 - y1 >= 2) {
                const midY = Math.floor((y1 + y2) / 2);
                path.push({ x: x1, y: midY }, { x: x2, y: midY });
            } else {
                const midX = Math.floor((x1 + x2) / 2);
                path.push({ x: x1, y: y1 + 1 }, { x: midX, y: y1 + 1 }, { x: midX, y: y2 - 1 }, { x: x2, y: y2 - 1 });
            }
        }
        else if (startSide === 'top' && endSide === 'bottom') {
            if (y1 - y2 >= 2) {
                const midY = Math.floor((y1 + y2) / 2);
                path.push({ x: x1, y: midY }, { x: x2, y: midY });
            } else {
                const midX = Math.floor((x1 + x2) / 2);
                path.push({ x: x1, y: y1 - 1 }, { x: midX, y: y1 - 1 }, { x: midX, y: y2 + 1 }, { x: x2, y: y2 + 1 });
            }
        }
        // --- 3. 兜底逻辑：通用四段式 (满足无法直接交点的正交情况) ---
        else {
            let currX = x1 + (sDir ? sDir.dx : 0);
            let currY = y1 + (sDir ? sDir.dy : 0);
            path.push({ x: currX, y: currY });

            let targetX = x2 + (eDir ? eDir.dx : 0);
            let targetY = y2 + (eDir ? eDir.dy : 0);

            if (currX !== targetX && currY !== targetY) {
                if (sDir && sDir.dx === 0) path.push({ x: targetX, y: currY });
                else path.push({ x: currX, y: targetY });
            }
            path.push({ x: targetX, y: targetY });
        }

        path.push({ x: x2, y: y2 });
        const r = this._finalizePath(path);
        console.log(`_calculatePath result: ${JSON.stringify(r)}`);
        return r;
    }

    _finalizePath(path) {
        if (path.length < 2) return path;

        // 第一步：去重（坐标完全相同的点）
        let uniquePoints = path.filter((p, i) =>
            i === 0 || p.x !== path[i - 1].x || p.y !== path[i - 1].y
        );

        // 第二步：合并共线点（优化三点一线）
        let finalPath = [];
        for (let i = 0; i < uniquePoints.length; i++) {
            const prev = finalPath[finalPath.length - 1];
            const curr = uniquePoints[i];
            const next = uniquePoints[i + 1];

            if (prev && next) {
                // 检查 prev -> curr -> next 是否在同一水平线或垂直线上
                const isHorizontal = prev.y === curr.y && curr.y === next.y;
                const isVertical = prev.x === curr.x && curr.x === next.x;
                if (isHorizontal || isVertical) {
                    continue; // 跳过当前的 curr，直接连接 prev 和 next
                }
            }
            finalPath.push(curr);
        }

        return finalPath;
    }
    _drawSegment(buffer, px1, py1, px2, py2, charset) {
        const dx = px2 - px1;
        const dy = py2 - py1;
        const char = dx !== 0 ? charset.h : charset.v;

        const minX = Math.min(px1, px2), maxX = Math.max(px1, px2);
        const minY = Math.min(py1, py2), maxY = Math.max(py1, py2);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                // 重点：跳过线段的两个端点
                if ((x === px1 && y === py1) || (x === px2 && y === py2)) continue;

                if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
                    buffer[y][x] = merge(char, buffer[y][x]);
                }
            }
        }
    }

    _drawCorners(buffer, points, charset) {
        // 只有 3 个点及以上才存在拐角，i 从 1 到倒数第二个点
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];

            // 1. 计算进入向量 (in) 和 离开向量 (out)
            const inDx = curr.x - prev.x;
            const inDy = curr.y - prev.y;
            const outDx = next.x - curr.x;
            const outDy = next.y - curr.y;

            let cornerChar = '';

            // 2. 判定转角类型
            if (inDx > 0) { // 水平向右进
                if (outDy > 0) cornerChar = charset.tr; // ┐ (向右再向下)
                else if (outDy < 0) cornerChar = charset.br; // ┘ (向右再向上)
            }
            else if (inDx < 0) { // 水平向左进
                if (outDy > 0) cornerChar = charset.tl; // ┌ (向左再向下)
                else if (outDy < 0) cornerChar = charset.bl; // └ (向左再向上)
            }
            else if (inDy > 0) { // 垂直向下进
                if (outDx > 0) cornerChar = charset.bl; // └ (向下再向右)
                else if (outDx < 0) cornerChar = charset.br; // ┘ (向下再向左)
            }
            else if (inDy < 0) { // 垂直向上进
                if (outDx > 0) cornerChar = charset.tl; // ┌ (向上再向右)
                else if (outDx < 0) cornerChar = charset.tr; // ┐ (向上再向左)
            }

            // 3. 写入缓冲区 (使用 merge 以兼容底层其他图形)
            if (cornerChar && curr.y >= 0 && curr.y < ROWS && curr.x >= 0 && curr.x < COLS) {
                buffer[curr.y][curr.x] = merge(cornerChar, buffer[curr.y][curr.x]);
            }
        }
    }

    _fillGapWithLine(buffer, p, pNext, charset) {
        if (!pNext) return;
        const char = (p.x !== pNext.x) ? charset.h : charset.v;
        if (p.y >= 0 && p.y < ROWS && p.x >= 0 && p.x < COLS) {
            buffer[p.y][p.x] = merge(char, buffer[p.y][p.x]);
        }
    }

    _drawMarker(buffer, x, y, side) {
        // 1. 安全检查，防止端点超出画布边界
        if (x < 0 || x >= COLS || y < 0 || y < 0 || y >= ROWS) {
            return;
        }

        // 2. 获取对应方向的箭头字符
        // 这里的 side 是吸附边的方向，箭头应该“指向”这条边
        const char = ARROW_CHARS[side];

        if (char) {
            // 3. 写入缓冲区
            // 注意：这里我们使用直接赋值。
            // 因为在我们的逻辑中，箭头是线条的终结，且它占据的位置
            // 应当是原本矩形边框的位置（或者自由端点的位置）。
            // 如果你希望箭头也能和底层背景融合，也可以改用 merge(char, buffer[y][x])
            buffer[y][x] = char;

            console.log(`_drawMarker: Placed ${char} at (${x}, ${y}) for side ${side}`);
        }
    }

    _getMarkerSide(isStart, pCurrent, pOther) {
        const dx = pOther.x - pCurrent.x;
        const dy = pOther.y - pCurrent.y;

        if (isStart) {
            // 起点箭头：方向与离开点的向量相反
            if (dx > 0) return 'left';
            if (dx < 0) return 'right';
            if (dy > 0) return 'top';
            return 'bottom';
        } else {
            // 终点箭头：方向指向目标
            if (dx > 0) return 'left';   // 从左往右指，吸附在左语义
            if (dx < 0) return 'right';
            if (dy > 0) return 'top';
            return 'bottom';
        }
    }
}

function initModel(model) {
    model.shapes.push(
        new Rect(3, 1, 61, 8, { text: "Welcome to ASCII Draw!\nversion: 1.0" }),
        new Line(3, 10, 63, 10),
        new Rect(3, 12, 61, 3, { alignX: "left", style: "none", text: "ASCII Draw is OPEN SOURCE!\nAuthor: Crypto Michael\nGitHub: https://github.com/michaelliao/asciidraw.puppylab.org" })
    );
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

        initModel(model);

        const scrollContainer = ref(null);
        const snapTarget = ref(null); // 存储当前吸附的目标信息 { x, y, nodeId, side }

        const canvasWidth = computed(() => {
            return config.charW * COLS;
        });

        const canvasHeight = computed(() => {
            return config.charH * ROWS;
        });

        // 计算属性：用于在 UI 上显示那个吸引人的“吸附圆点”
        const snapStyle = computed(() => {
            if (!snapTarget.value) return { display: 'none' };
            return {
                left: snapTarget.value.x * config.charW + 'px',
                top: snapTarget.value.y * config.charH + 'px',
                width: config.charW + 'px',
                height: config.charH + 'px',
                display: 'block'
            };
        });

        // 计算属性：当前选中的节点对象
        const selectedNode = computed(() =>
            model.shapes.find(n => n.id === selectedNodeId.value)
        );

        // 计算属性：高亮遮罩的样式
        const selectionStyle = computed(() => {
            if (!selectedNode.value) {
                return {};
            }
            const bounds = selectedNode.value.getBounds(model);
            return {
                left: (bounds.x * config.charW) + 'px',
                top: (bounds.y * config.charH) + 'px',
                width: (bounds.w * config.charW) + 'px',
                height: (bounds.h * config.charH) + 'px'
            };
        });

        const renderToBuffer = () => {
            const buffer = createBuffer();
            const ctx = new Context(buffer, model);
            // 按照层级绘制所有形状
            model.shapes.forEach(node => {
                node.draw(ctx);
            });
            return buffer;
        };

        const screenOutput = computed(() => {
            const buffer = renderToBuffer();
            return buffer.map(row => row.join('')).join('\n');
        });

        const copyToClipboard = async () => {
            // 1. 获取最新的渲染数据
            const buffer = renderToBuffer();

            // 2. 扫描非空边界
            let minX = COLS, maxX = -1;
            let minY = ROWS, maxY = -1;
            let hasContent = false;

            for (let y = 0; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    const char = buffer[y][x];
                    // 排除空格和未定义字符
                    if (char && char !== ' ') {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                        hasContent = true;
                    }
                }
            }

            if (!hasContent) {
                console.warn("Canvas is empty, nothing to copy.");
                return;
            }

            // 3. 裁剪并构建字符串
            let output = "";
            for (let y = minY; y <= maxY; y++) {
                let rowStr = "";
                for (let x = minX; x <= maxX; x++) {
                    rowStr += buffer[y][x] || " ";
                }
                // trimEnd 移除行尾冗余空格，但在最后一行不加换行符
                output += rowStr.trimEnd() + (y === maxY ? "" : "\n");
            }

            // 4. 调用剪贴板 API
            try {
                await navigator.clipboard.writeText(output);
                // 这里可以添加一个反馈效果
                console.log("Copied to clipboard with cropping!");
            } catch (err) {
                console.error("Failed to copy to clipboard:", err);
            }
        };

        const addShape = (type, props = {}) => {
            // 1. 确定当前视口的中点坐标 (Grid 坐标)
            // 需要考虑滚动条的偏移量
            const container = scrollContainer.value; // 指向 <section> 的 ref
            const scrollLeft = container ? container.scrollLeft : 0;
            const scrollTop = container ? container.scrollTop : 0;
            const viewW = container ? container.clientWidth : window.innerWidth;
            const viewH = container ? container.clientHeight : window.innerHeight;

            // 计算相对于画布原点的像素中点，然后转为网格坐标
            const centerX = Math.floor((scrollLeft + viewW / 2) / config.charW);
            const centerY = Math.floor((scrollTop + viewH / 2) / config.charH);

            let newShape = null;

            // 2. 工厂模式创建 Shape
            if (type.toLowerCase() === 'rect') {
                const w = 21;
                const h = 5;
                // 修正坐标，让 (centerX, centerY) 成为矩形的中心
                newShape = new Rect(
                    centerX - Math.floor(w / 2),
                    centerY - Math.floor(h / 2),
                    w,
                    h,
                    props // 合并额外属性，如 style: "bold"
                );
            }
            else if (type.toLowerCase() === 'line') {
                const length = 20;
                // 创建一根长度为 20 的横线，中点在 (centerX, centerY)
                newShape = new Line(
                    centerX - Math.floor(length / 2),
                    centerY,
                    centerX + Math.floor(length / 2),
                    centerY,
                    props
                );
            }

            // 3. 添加到 model 并选中它
            if (newShape) {
                model.shapes.push(newShape);
                selectedNodeId.value = newShape.id; // 自动选中新创建的图形
            }
        };

        // 删除当前选中的节点
        const deleteSelectedShape = () => {
            if (!selectedNodeId.value) return;

            // 找到当前选中项在数组中的索引
            const index = model.shapes.findIndex(s => s.id === selectedNodeId.value);

            if (index !== -1) {
                // 从数组中移除
                model.shapes.splice(index, 1);

                // 关键：删除后清空选中状态
                selectedNodeId.value = null;

                console.log("Shape deleted");
            }
        };

        const downloadFile = () => {
            // 1. 构造 JSON 数据结构
            const data = {
                version: 1,
                // 调用每个 shape 的 toJSON() 方法
                shapes: model.shapes.map(shape => shape.toJSON())
            };

            // 2. 将对象转换为 JSON 字符串 (包含 2 空格缩进，方便人类阅读)
            const jsonString = JSON.stringify(data, null, 2);

            console.log(">>> download >>>");
            console.log(jsonString);

            // 3. 创建 Blob 对象，指定类型为 json
            const blob = new Blob([jsonString], { type: "application/json" });

            // 4. 创建一个临时的下载链接
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = "unamed.asciidraw"; // 指定下载文件名

            // 5. 触发点击并移除临时对象
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // 释放 URL 对象，节省内存
            URL.revokeObjectURL(url);

            console.log("File exported as unamed.asciidraw");
        };

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

                    // 计算新坐标
                    let newX = initialData.x + deltaX * map[0];
                    let newY = initialData.y + deltaY * map[1];
                    let newW = initialData.w + deltaX * map[2];
                    let newH = initialData.h + deltaY * map[3];

                    // 移动模式下不需要尺寸限制，但如果是调整大小则需要
                    if (handleType !== 'move') {
                        if (newW < 2) {
                            if (map[0] === 1) newX = initialData.x + initialData.w - 2;
                            newW = 2;
                        }
                        if (newH < 2) {
                            if (map[1] === 1) newY = initialData.y + initialData.h - 2;
                            newH = 2;
                        }
                    }

                    node.x = newX;
                    node.y = newY;
                    node.w = newW;
                    node.h = newH;

                    // 特别提示：因为 Line 的 getEffectiveCoords 应该是实时计算的
                    // 所以只要 Rect 坐标变了，吸附在该 Rect 上的 Line 会在下一帧自动重绘到新位置
                } else if (node.type === 'Line') {
                    const isStart = handleType === 'start';
                    // 1. 计算当前的原始目标位置
                    let tx = (isStart ? initialData.x : initialData.x2) + deltaX;
                    let ty = (isStart ? initialData.y : initialData.y2) + deltaY;

                    // 2. 探测吸附
                    let bestSnap = null;
                    let minOffset = 1; // 探测半径：1个字符以内触发

                    model.shapes.forEach(s => {
                        if (s.type !== 'Rect') return;

                        // 互斥检查：获取另一个端点的绑定信息
                        const otherBinding = isStart ? node.endBinding : node.startBinding;

                        const { x, y, w, h } = s.getBounds();
                        const midPoints = [
                            { x: x + Math.floor(w / 2), y: y, side: 'top' },
                            { x: x + Math.floor(w / 2), y: y + h - 1, side: 'bottom' },
                            { x: x, y: y + Math.floor(h / 2), side: 'left' },
                            { x: x + w - 1, y: y + Math.floor(h / 2), side: 'right' }
                        ];

                        midPoints.forEach(p => {
                            // 如果另一个端点已经绑在这个矩形的这条边上，跳过
                            if (otherBinding.nodeId === s.id && otherBinding.side === p.side) return;

                            const dist = Math.sqrt(Math.pow(tx - p.x, 2) + Math.pow(ty - p.y, 2));
                            if (dist < minOffset) {
                                bestSnap = { ...p, nodeId: s.id };
                                minOffset = dist;
                            }
                        });
                    });

                    // 3. 应用吸附或自由移动
                    const currentBinding = isStart ? node.startBinding : node.endBinding;
                    if (bestSnap) {
                        tx = bestSnap.x;
                        ty = bestSnap.y;
                        currentBinding.nodeId = bestSnap.nodeId;
                        currentBinding.side = bestSnap.side;
                        snapTarget.value = bestSnap; // 激活高亮
                    } else {
                        currentBinding.nodeId = null;
                        currentBinding.side = null;
                        snapTarget.value = null;
                    }

                    // 更新坐标（若是绑定的，坐标会在 draw 时被 getEffectiveCoords 覆盖，但这里保留值有助于断开连接后的位置）
                    if (isStart) {
                        node.x = tx; node.y = ty;
                    } else {
                        node.x2 = tx; node.y2 = ty;
                    }
                }
            };

            const onMouseUp = () => {
                snapTarget.value = null; // 清除高亮
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
            model, canvasWidth, canvasHeight, screenOutput, copyToClipboard, downloadFile, deleteSelectedShape,
            addShape, scrollContainer, selectedNodeId, selectedNode, selectionStyle, snapStyle, config,
            handlePositions, handleResizeStart,
            handleCanvasClick, currentGrid
        };
    }
}).mount('#app');
