// tailwind.config.js - Modern Enterprise SaaS Design
module.exports = {
    darkMode: "class",
    content: [
        "./*.html",
        "./js/**/*.js",
    ],
    theme: {
        extend: {
            colors: {
                // Primary Blue - Main action color
                "primary": "#0066FF",
                "primary-dark": "#0052CC",
                "primary-light": "#E6F0FF",

                // Success Green - For positive values, active status
                "success": "#22C55E",
                "success-light": "#DCFCE7",

                // Neutral Background
                "background-light": "#F8F9FA",
                "background-dark": "#1A1D21",

                // Surface (Cards, Modals)
                "surface-light": "#FFFFFF",
                "surface-dark": "#22272E",

                // Border
                "border-light": "#E2E8F0",
                "border-dark": "#374151",

                // Text colors
                "text-primary": "#1E293B",
                "text-secondary": "#64748B",
                "text-muted": "#94A3B8",

                // Status colors
                "danger": "#EF4444",
                "danger-light": "#FEE2E2",
                "warning": "#F59E0B",
                "warning-light": "#FEF3C7",
                "info": "#3B82F6",
                "info-light": "#DBEAFE",
            },
            fontFamily: {
                "display": ["Inter", "system-ui", "sans-serif"],
                "mono": ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
            },
            fontSize: {
                "xs": ["0.75rem", { lineHeight: "1rem" }],
                "sm": ["0.875rem", { lineHeight: "1.25rem" }],
                "base": ["1rem", { lineHeight: "1.5rem" }],
                "lg": ["1.125rem", { lineHeight: "1.75rem" }],
                "xl": ["1.25rem", { lineHeight: "1.75rem" }],
                "2xl": ["1.5rem", { lineHeight: "2rem" }],
                "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
            },
            borderRadius: {
                "DEFAULT": "0.5rem",
                "lg": "0.75rem",
                "xl": "1rem",
                "2xl": "1.5rem",
                "3xl": "1.5rem", // 24px for cards/modals
                "full": "9999px"
            },
            boxShadow: {
                'soft': '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 4px 16px -4px rgba(0, 0, 0, 0.08)',
                'card': '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.06)',
                'modal': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                'glow': '0 0 20px rgba(0, 102, 255, 0.15)',
                'glow-success': '0 0 20px rgba(34, 197, 94, 0.15)',
            },
            spacing: {
                '18': '4.5rem',
                '88': '22rem',
            }
        },
    },
    plugins: [],
};
