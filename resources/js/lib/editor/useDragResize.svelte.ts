type Position = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type DragResizeOptions = {
    getPosition: () => Position;
    onUpdate: (updates: Partial<Position>) => void;
    scale?: () => number;
    minWidth?: number;
    minHeight?: number;
};

type DragResizeState = {
    isDragging: boolean;
    isResizing: string | null;
    handleMouseDown: (e: MouseEvent) => void;
    handleResizeStart: (corner: string, e: MouseEvent) => void;
    cleanup: () => void;
};

export function useDragResize(options: DragResizeOptions): DragResizeState {
    const minW = options.minWidth ?? 20;
    const minH = options.minHeight ?? 20;

    let isDragging = $state(false);
    let isResizing = $state<string | null>(null);
    let dragStart = { x: 0, y: 0, posX: 0, posY: 0, posW: 0, posH: 0 };

    function getScale(): number {
        return options.scale?.() ?? 1;
    }

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0 || isResizing) return;
        e.stopPropagation();

        const pos = options.getPosition();
        isDragging = true;
        dragStart = {
            x: e.clientX,
            y: e.clientY,
            posX: pos.x,
            posY: pos.y,
            posW: pos.width,
            posH: pos.height,
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e: MouseEvent) {
        const s = getScale();

        if (isDragging) {
            const deltaX = (e.clientX - dragStart.x) / s;
            const deltaY = (e.clientY - dragStart.y) / s;

            options.onUpdate({
                x: Math.round(dragStart.posX + deltaX),
                y: Math.round(dragStart.posY + deltaY),
            });
        } else if (isResizing) {
            const deltaX = (e.clientX - dragStart.x) / s;
            const deltaY = (e.clientY - dragStart.y) / s;

            let newX = dragStart.posX;
            let newY = dragStart.posY;
            let newW = dragStart.posW;
            let newH = dragStart.posH;

            if (isResizing.includes('left')) {
                newX = dragStart.posX + deltaX;
                newW = dragStart.posW - deltaX;
            }
            if (isResizing.includes('right')) {
                newW = dragStart.posW + deltaX;
            }
            if (isResizing.includes('top')) {
                newY = dragStart.posY + deltaY;
                newH = dragStart.posH - deltaY;
            }
            if (isResizing.includes('bottom')) {
                newH = dragStart.posH + deltaY;
            }

            if (e.shiftKey && dragStart.posW > 0 && dragStart.posH > 0) {
                const aspectRatio = dragStart.posW / dragStart.posH;
                const handle = isResizing;
                const isHorizontalHandle =
                    handle === 'left' || handle === 'right';
                const isVerticalHandle =
                    handle === 'top' || handle === 'bottom';

                if (
                    isHorizontalHandle ||
                    Math.abs(newW - dragStart.posW) >=
                        Math.abs(newH - dragStart.posH)
                ) {
                    newH = newW / aspectRatio;
                } else if (
                    isVerticalHandle ||
                    Math.abs(newH - dragStart.posH) >
                        Math.abs(newW - dragStart.posW)
                ) {
                    newW = newH * aspectRatio;
                }

                if (handle.includes('left')) {
                    newX = dragStart.posX + dragStart.posW - newW;
                }

                if (handle.includes('top')) {
                    newY = dragStart.posY + dragStart.posH - newH;
                }
            }

            if (newW < minW) {
                if (e.shiftKey && dragStart.posW > 0 && dragStart.posH > 0) {
                    newH = minW / (dragStart.posW / dragStart.posH);
                }
                if (isResizing.includes('left')) {
                    newX = dragStart.posX + dragStart.posW - minW;
                }
                if (isResizing.includes('top') && e.shiftKey) {
                    newY = dragStart.posY + dragStart.posH - newH;
                }
                newW = minW;
            }
            if (newH < minH) {
                if (e.shiftKey && dragStart.posW > 0 && dragStart.posH > 0) {
                    newW = minH * (dragStart.posW / dragStart.posH);
                }
                if (isResizing.includes('top')) {
                    newY = dragStart.posY + dragStart.posH - minH;
                }
                if (isResizing.includes('left') && e.shiftKey) {
                    newX = dragStart.posX + dragStart.posW - newW;
                }
                newH = minH;
            }

            options.onUpdate({
                x: Math.round(newX),
                y: Math.round(newY),
                width: Math.round(newW),
                height: Math.round(newH),
            });
        }
    }

    function handleMouseUp() {
        isDragging = false;
        isResizing = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }

    function handleResizeStart(corner: string, e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();

        const pos = options.getPosition();
        isResizing = corner;
        dragStart = {
            x: e.clientX,
            y: e.clientY,
            posX: pos.x,
            posY: pos.y,
            posW: pos.width,
            posH: pos.height,
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function cleanup() {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }

    return {
        get isDragging() {
            return isDragging;
        },
        get isResizing() {
            return isResizing;
        },
        handleMouseDown,
        handleResizeStart,
        cleanup,
    };
}
