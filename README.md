# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Troubleshooting Git Authentication

If you encounter `ECONNREFUSED` or authentication errors when pushing/pulling, it is often due to a stale VS Code Git socket. Try the following commands in your terminal:

1.  **Clear stale environment variables:**
    ```bash
    unset GIT_ASKPASS
    unset VSCODE_GIT_IPC_HANDLE
    ```

2.  **Reset credential helper (optional):**
    ```bash
    git config --global --unset credential.helper
    ```

3.  **Pull again:**
    ```bash
    git pull origin main
    ```
    *Note: When prompted for a password on GitHub, use a **Personal Access Token (PAT)**, not your account password.*
