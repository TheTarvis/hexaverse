# Facelift Blog Images

This directory contains before/after comparison images for the v0.18.0 facelift blog post.

## Required Images

Add the following screenshots to this directory:

### Landing Page
- `before-landing.png` - Landing page before facelift (from commit af7597b)
- `after-landing.png` - Landing page after facelift (from commit 86eae7b or current)

### Dashboard
- `before-dashboard.png` - Dashboard before facelift
- `after-dashboard.png` - Dashboard after facelift

### Imports
- `before-imports.png` - Imports page before facelift
- `after-imports.png` - Imports page after facelift

## How to Capture Screenshots

### Before Screenshots (commit af7597b)
```bash
git stash                    # Save current changes
git checkout af7597b        # Checkout commit before facelift
cd frontend
npm run dev                 # Start dev server
```
Then capture screenshots of:
- http://localhost:3000 (landing page)
- http://localhost:3000/dashboard (requires login)
- http://localhost:3000/imports (requires login)

### After Screenshots (current version)
```bash
git checkout main           # Or your current branch
cd frontend
npm run dev
```
Capture the same pages.

## Screenshot Recommendations

- **Resolution**: 1920x1080 or higher for crisp images
- **Browser**: Use Chrome/Brave in dark mode for consistency
- **Zoom**: 100% browser zoom
- **Window**: Full screen or large window size
- **State**: Capture pages with sample data (not empty states)

## Image Optimization

After adding images, optimize them:
```bash
# Install sharp-cli if needed
npm install -g sharp-cli

# Optimize images
sharp -i before-landing.png -o before-landing.png --quality 80
sharp -i after-landing.png -o after-landing.png --quality 80
# ... repeat for other images
```

## Blog Post Location

The blog post that uses these images is located at:
`frontend/app/(marketing)/blog/two-week-redesign/page.tsx`

View at: http://localhost:3000/blog/two-week-redesign
