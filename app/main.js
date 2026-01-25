const { createApp, ref, computed, onMounted, nextTick, reactive } = Vue;

createApp({
    setup() {
        // 响应式状态，存储测量后的精确数值
        const config = reactive({
            charW: 9.6,
            charH: 24
        });

        const canvasWidth = 2000;
        const canvasHeight = 4000;
        const ROWS = 500;
        const COLS = 200;

        const selectedNodeId = ref(null);
        const currentGrid = ref({ x: 0, y: 0 });

        // 模拟节点树
        const nodes = ref([
            { id: 1, name: 'Rect 1', type: 'rect', x: 10, y: 5, w: 30, h: 6 },
            { id: 2, name: 'Rect 2', type: 'rect', x: 22, y: 7, w: 30, h: 12 },
            { id: 3, name: 'Rect 3', type: 'rect', x: 5, y: 15, w: 15, h: 4 }
        ]);

        // 计算属性：当前选中的节点对象
        const selectedNode = computed(() =>
            nodes.value.find(n => n.id === selectedNodeId.value)
        );

        // 计算属性：高亮遮罩的样式
        const selectionStyle = computed(() => {
            if (!selectedNode.value) return {};
            return {
                left: (selectedNode.value.x * config.charW) + 'px',
                top: (selectedNode.value.y * config.charH) + 'px',
                width: (selectedNode.value.w * config.charW) + 'px',
                height: (selectedNode.value.h * config.charH) + 'px'
            };
        });

        // 渲染缓冲区字符串
        const screenOutput = computed(() => {
            const buffer = Array(ROWS).fill().map(() => Array(COLS).fill(' '));

            nodes.value.forEach(node => {
                for (let i = 0; i < node.h; i++) {
                    for (let j = 0; j < node.w; j++) {
                        let char = ' ';
                        if (i === 0 || i === node.h - 1) char = '─';
                        if (j === 0 || j === node.w - 1) char = '│';
                        if (i === 0 && j === 0) char = '┌';
                        if (i === 0 && j === node.w - 1) char = '┐';
                        if (i === node.h - 1 && j === 0) char = '└';
                        if (i === node.h - 1 && j === node.w - 1) char = '┘';

                        const targetY = node.y + i;
                        const targetX = node.x + j;
                        if (targetY < ROWS && targetX < COLS) {
                            buffer[targetY][targetX] = char;
                        }
                    }
                }
            });

            return buffer.map(row => row.join('')).join('\n');
        });

        // 处理点击选中
        const handleCanvasClick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const gx = Math.floor(x / config.charW);
            const gy = Math.floor(y / config.charH);
            currentGrid.value = { x: gx, y: gy };

            // 命中检测 (简单的矩形碰撞)
            const hit = [...nodes.value].reverse().find(node =>
                gx >= node.x && gx < node.x + node.w &&
                gy >= node.y && gy < node.y + node.h
            );

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
            // 测量 100 个字符再除以 100，能极大减小亚像素误差
            tester.innerText = 'A'.repeat(100);
            document.body.appendChild(tester);

            const rect = tester.getBoundingClientRect();
            config.charW = rect.width / 100;
            config.charH = 24; // 对应 CSS 里的 line-height
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
