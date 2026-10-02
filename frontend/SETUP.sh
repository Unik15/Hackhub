#!/bin/bash
# HackHub — full project bootstrap

# 1. Scaffold Vite + React
npm create vite@latest hackhub -- --template react
cd hackhub

# 2. Base deps
npm install

# 3. Tailwind CSS
npm install -D tailwindcss postcss autoprefixer tailwindcss-animate
npx tailwindcss init -p

# 4. Routing, animation, utilities
npm install react-router-dom framer-motion clsx tailwind-merge class-variance-authority lucide-react

# 5. shadcn/ui (interactive — pick "Neutral" base color, Yes to CSS variables)
npx shadcn@latest init

# 6. Add the primitives you'll need first
npx shadcn@latest add button dialog badge input label select toast

# 7. Folder structure
mkdir -p src/{components/ui,pages,modals,hooks,services,utils,layouts}

# 8. Run it
npm run dev
