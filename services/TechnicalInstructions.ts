
/**
 * TECHNICAL INSTRUCTIONS & CONFIGURATION
 * 
 * This file controls the visual rendering, chart dimensions,
 * export settings, and other technical behaviors of the application.
 * It is NOT used by the AI for content generation.
 */

export const TECHNICAL_CONFIG = {
    GANTT: {
        ONE_DAY_MS: 24 * 60 * 60 * 1000,
        MIN_BAR_WIDTH: 5,
        HEADER_HEIGHT: 40,
        ROW_HEIGHT: 48, // Matches CSS height of task row
        BAR_HEIGHT: 20, // Height of the task bar
        BAR_OFFSET_Y: 14, // (ROW_HEIGHT - BAR_HEIGHT) / 2 -> (48-20)/2 = 14
        VIEW_SETTINGS: {
            week: { px: 20, label: 'weeks' },
            month: { px: 4, label: 'months' },
            quarter: { px: 1, label: 'quarters' },
            semester: { px: 0.7, label: 'semesters' },
            year: { px: 0.3, label: 'years' },
            project: { px: 0, label: 'project' } // Px calculated dynamically in component
        },
        STYLES: {
            HEADER_BG: 'bg-slate-50',
            GRID_LINE_COLOR: 'border-slate-100',
            TASK_BAR_COLOR: 'bg-indigo-400',
            TASK_BAR_HOVER: 'bg-indigo-500',
            MILESTONE_COLOR: 'bg-black',
            CRITICAL_PATH_COLOR: 'stroke-red-600'
        }
    },

    PERT: {
        NODE_WIDTH: 180,
        NODE_HEIGHT: 80,
        X_GAP: 100, // Horizontal gap between levels
        Y_GAP: 40,  // Vertical gap between nodes
        STYLES: {
            NODE_BG: 'bg-white',
            NODE_BORDER_DEFAULT: 'border-slate-200',
            NODE_BORDER_CRITICAL: 'border-red-200',
            EDGE_DEFAULT: '#e2e8f0', // Slate 200
            EDGE_CRITICAL: '#dc2626', // Red 600
            EDGE_ACTIVE_INCOMING: '#22c55e', // Green 500
            EDGE_ACTIVE_OUTGOING: '#0284c7'  // Blue 600
        }
    },

    EXPORT: {
        DOCX: {
            FONT: "Calibri",
            BODY_SIZE: 22, // 11pt
            HEADING1_SIZE: 32, // 16pt
            HEADING1_COLOR: "2E74B5",
            IMAGE_WIDTH: 600
        },
        CANVAS: {
            SCALE: 2,
            BG_COLOR: '#ffffff'
        }
    },

    UI: {
        ANIMATION_DURATION: 300,
        TOAST_DURATION: 3000,
        SCROLL_OFFSET: 24
    }
};
