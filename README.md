# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Troubleshooting Git

### 1. Fix "ECONNREFUSED" (Stale Socket)
Run these commands in your terminal to clear stale VS Code Git authentication variables:
```bash
unset GIT_ASKPASS
unset VSCODE_GIT_IPC_HANDLE
```

### 2. Generate a Personal Access Token (PAT)
GitHub requires a token instead of a password for command-line operations:
1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens (classic)](https://github.com/settings/tokens).
2. Click **Generate new token (classic)**.
3. Give it a name (e.g., "Firebase Studio") and select the **'repo'** scope.
4. Click **Generate token** and **COPY IT IMMEDIATELY**. You won't see it again.

### 3. Authenticate with the Token
When you run `git pull origin main`:
1. **Username:** Enter your GitHub username (`serviceguru-crypt`).
2. **Password:** **PASTE THE TOKEN** you just copied (characters will not appear as you paste).

### 4. Resolve "Divergent Branches" Error
If Git says "Need to specify how to reconcile divergent branches", run this to merge the changes:
```bash
git pull origin main --no-rebase
```

### 5. Reset Credentials (Optional)
If Git doesn't prompt you for a password and just fails, reset the helper:
```bash
git config --global --unset credential.helper
```
