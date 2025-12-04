# Quick Start Guide

## Start Development Server

Run this command from the `frontend/react-app` directory:

```bash
npm run dev
```

Then open: **http://localhost:5173**

## Important Notes

1. **Backend Must Be Running**
   - The React app proxies API calls to `http://localhost:8000`
   - Make sure your FastAPI backend is running first
   - Start backend: `python backend/main.py` from project root

2. **Hot Reload**
   - Changes to `.jsx` files auto-reload
   - Changes to `.css` files auto-reload
   - No manual refresh needed!

3. **First Time Setup**
   - If you just cloned/pulled, run `npm install` first
   - This installs dependencies

## Common Commands

```bash
# Install dependencies (first time only)
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Troubleshooting

### Port 5173 already in use
```bash
# Kill the process using port 5173
lsof -ti:5173 | xargs kill -9

# Or change the port in vite.config.js:
# server: { port: 3000 }
```

### API calls failing
- Check backend is running on port 8000
- Check browser console for errors
- Verify `/api` proxy is working in vite.config.js

### Module not found errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Development Workflow

1. Start backend: `python backend/main.py`
2. Start React dev server: `npm run dev`
3. Open http://localhost:5173
4. Make changes to `.jsx` or `.css` files
5. See changes instantly in browser!

Happy coding! 🚀
