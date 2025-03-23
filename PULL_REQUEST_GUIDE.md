# Creating and Managing Pull Requests for SOLidify

This guide explains how to create and manage pull requests (PRs) for the SOLidify project using both GitHub's web interface and command line tools.

## Creating a Pull Request Using GitHub Web Interface

1. **Push your feature branch to GitHub:**
   ```bash
   git push -u origin feature/your-feature-name
   ```

2. **Go to GitHub repository:**
   - Visit https://github.com/steccomeno/SOLidify

3. **Create a Pull Request:**
   - You'll see a notification banner for your recently pushed branch
   - Click the **Compare & pull request** button
   - Select `develop` as the base branch (what you want to merge into)
   - Select your feature branch as the compare branch (what contains your changes)
   - Add a descriptive title and detailed description
   - Click **Create pull request**

## Creating a Pull Request Using GitHub CLI (recommended for future use)

For a more streamlined workflow, you can install the GitHub CLI (gh):

1. **Install GitHub CLI:**
   - macOS: `brew install gh`
   - Windows: `winget install --id GitHub.cli`
   - Linux: See [GitHub CLI installation](https://github.com/cli/cli#installation)

2. **Authenticate with GitHub:**
   ```bash
   gh auth login
   ```

3. **Create a Pull Request:**
   ```bash
   # Push your branch first
   git push -u origin feature/your-feature-name
   
   # Create the PR
   gh pr create --base develop --head feature/your-feature-name --title "Your PR Title" --body "Detailed description of your changes"
   ```

## Pull Request Best Practices

1. **Descriptive Titles:** Use clear, concise titles that summarize the changes.

2. **Detailed Descriptions:** Include:
   - What changes were made
   - Why they were made
   - How to test the changes
   - Any notes for reviewers

3. **Keep PRs Focused:** Each PR should address a single feature or fix.

4. **Link Issues:** Reference related issues using `Fixes #123` or `Relates to #123`.

5. **CI Checks:** Ensure all automated tests pass before requesting review.

6. **Request Reviews:** Assign appropriate team members to review your code.

## Reviewing Pull Requests

1. **Code Review Checklist:**
   - Does the code work as expected?
   - Is the code maintainable and readable?
   - Does it follow project conventions?
   - Are there adequate tests?
   - Is performance considered?

2. **Providing Feedback:**
   - Be specific and constructive
   - Explain why a change is needed
   - Suggest alternatives when appropriate

3. **Approving and Merging:**
   - Approve the PR when you're satisfied with the changes
   - For `develop` and `main` branches, merging requires approval
   - Use the **Squash and merge** option for a cleaner history

## Managing Your PR After Creation

1. **Addressing Feedback:**
   ```bash
   # Make additional changes based on feedback
   git add .
   git commit -m "Address PR feedback"
   git push
   ```

2. **Updating Your PR with Upstream Changes:**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout feature/your-feature-name
   git merge develop
   git push
   ```

Following these practices will help ensure a smooth collaborative development process for the SOLidify project. 