# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Troubleshooting Git

### 🚨 "Unfinished Merge" (MERGE_HEAD exists)
If you see an error saying "You have not concluded your merge":
1. **Commit the resolved conflicts:**
   ```bash
   git add .
   git commit -m "Resolve merge conflicts"
   ```
2. **Now you can pull or push normally.**

### 🚨 "No tracking information" or "No upstream branch"
If you see an error saying "There is no tracking information" or "The current branch has no upstream branch":
1. **Link your current branch to the remote main branch:**
   ```bash
   git branch --set-upstream-to=origin/main
   ```
2. **If you just want to push your specific branch to main on GitHub:**
   ```bash
   git push origin logo:main
   ```

### 🚨 The "Already up to date" but "Rejected" Loop
If `git pull` says you are up to date, but `git push` is still rejected:
1. **Force a sync (The Nuclear Option):**
   *Warning: This will make the remote GitHub repository exactly match your local code.*
   ```bash
   git push origin logo:main --force
   ```

### 🚨 Fix "Rejected / Non-Fast-Forward" Push
If you see `! [rejected] main -> main (non-fast-forward)`, it means GitHub has changes you don't have.
1. Run this command:
   ```bash
   git pull origin main --no-rebase
   ```
2. If a text editor opens (Vim), type `:wq` and press **Enter** to save the merge message.
3. Now you can push:
   ```bash
   git push origin logo:main
   ```

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

### 3. Save Credentials (Avoid Re-typing)
To stop Git from asking for your token every time, run this command:
```bash
git config --global credential.helper store
```
**Important:** You must enter your username and token **one more time** correctly. Git will then save them permanently on this machine.

### 4. Reset Credentials (Optional)
If Git doesn't prompt you for a password and just fails, or if you entered the wrong token, reset the helper to clear old data:
```bash
git config --global --unset credential.helper
```
