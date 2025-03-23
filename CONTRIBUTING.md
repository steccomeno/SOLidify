# Contributing to SOLidify

Thank you for your interest in contributing to the SOLidify project! This document outlines our collaborative development workflow using Git branches and pull requests.

## Branching Strategy

We follow a simplified GitFlow workflow:

- `main` - Production-ready code. Protected and requires pull request reviews.
- `develop` - Integration branch for features. Also protected.
- `feature/xxx` - Individual feature branches where development happens.
- `bugfix/xxx` - For bug fixes.
- `hotfix/xxx` - For urgent fixes to production.

## Development Workflow

### Starting New Work

1. Always start by pulling the latest changes from the main branch:
   ```
   git checkout main
   git pull origin main
   ```

2. Create a new feature branch with a descriptive name:
   ```
   git checkout -b feature/your-feature-name
   ```
   Use prefixes like `feature/`, `bugfix/`, or `hotfix/` followed by a descriptive name.

3. Work on your changes, making frequent, small commits with clear messages:
   ```
   git add .
   git commit -m "Descriptive message about what changed and why"
   ```

4. Push your branch to GitHub:
   ```
   git push -u origin feature/your-feature-name
   ```

### Submitting Your Work for Review

1. Before submitting, make sure your branch is up to date with `main`:
   ```
   git checkout main
   git pull origin main
   git checkout feature/your-feature-name
   git merge main
   ```

2. Resolve any merge conflicts if they occur.

3. Push your updated branch:
   ```
   git push origin feature/your-feature-name
   ```

4. Go to GitHub and create a Pull Request (PR) from your feature branch to `main`.
   - Provide a clear title and description
   - Reference any related issues
   - Request reviews from team members

5. Address any feedback from reviewers by making additional commits to your branch.

### Reviewing Pull Requests

As a reviewer:

1. Review the code changes, focusing on:
   - Functionality: Does it work as expected?
   - Code quality: Is it readable, maintainable, and following best practices?
   - Security: Are there any potential security issues?
   - Performance: Are there any performance concerns?

2. Provide constructive feedback:
   - Be specific about what needs to change and why
   - Suggest alternatives where appropriate
   - Approve the PR when you're satisfied with the changes

### After Approval

Once a PR has been approved:

1. The PR can be merged into the `main` branch via GitHub.
2. Delete the feature branch after merging.
3. Pull the latest changes from `main` to your local repository:
   ```
   git checkout main
   git pull origin main
   ```

## Best Practices

- **Never** commit directly to `main` or `develop`
- Keep your commits small and focused on a single task
- Write clear, descriptive commit messages
- Update your branch with changes from `main` regularly
- Resolve conflicts promptly
- Review PRs thoroughly and provide constructive feedback

By following this workflow, we ensure that:
- Code quality is maintained through peer review
- The `main` branch always contains stable, production-ready code
- Multiple developers can work on different features simultaneously
- Changes are properly tracked and documented 