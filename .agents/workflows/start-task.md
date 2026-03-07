---
description: Start a new task by pulling main and creating a worktree
---

When starting a new task, follow these steps to ensure clean isolation and support parallel agent work:

1. **Update main branch**
   - Run `git checkout main` and `git pull origin main` in the primary workspace.
   
// turbo
2. **Create a new worktree**
   - Define a task-specific branch name (e.g., `task/TASK_ID-description`).
   - Create a worktree in a sibling directory: `git worktree add ../vscode-figmalab-TASK_ID -b task/TASK_ID-description main`.

3. **Switch to worktree**
   - Move into the new worktree directory for all subsequent operations.

4. **Install dependencies**
   - Run `npm install` (if necessary) within the worktree.

5. **Proceed with task**
   - All code edits, tests, and commits must happen within the task-specific worktree.
