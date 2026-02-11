---
description: Push all changes to the GitHub repository (git add, commit, push)
---

# Push Changes to GitHub

This workflow pushes all current changes to the remote repository.

// turbo-all

1. Check current git status to see what changed:
```
git status --short
```

2. Stage all changes:
```
git add -A
```

3. Commit with a descriptive message based on what was changed:
```
git commit -m "<describe the changes made in this session>"
```

4. Push to origin main:
```
git push origin main
```

**Working directory**: `d:\proyecto keyler rutas\logistics-dashboard`

**Notes**:
- The commit message should summarize the actual changes made, not be generic
- If there are no changes to commit, skip the commit and push steps
- Always run from the logistics-dashboard directory
