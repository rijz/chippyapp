/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                chippy: {
                    coral: '#FF6B5E',
                    'coral-hover': '#E55A4D',
                    navy: '#1A2332',
                    'navy-light': '#2A3546',
                    cream: '#FFF8F0',
                    yellow: '#FFD93D',
                    sage: '#7FB069',
                    gray: '#F5F7FA',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            animation: {
                'marquee': 'marquee 25s linear infinite',
            },
            keyframes: {
                marquee: {
                    '0%': { transform: 'translateX(0%)' },
                    '100%': { transform: 'translateX(-100%)' },
                }
            }
        }
    },
    plugins: [],
}
