# SOLidify Collaborative Development Workflow

This document outlines the collaborative development workflow for the SOLidify project. By following these guidelines, multiple developers can work on the project simultaneously without conflicts, while maintaining code quality through reviews.

## Branch Structure

Our project uses the following branch structure:

- **`main`**: The production-ready branch. Protected and requires PR reviews.
- **`develop`**: Integration branch where features are combined. Also protected.
- **`feature/xxx`**: Individual feature branches where development happens.
- **`bugfix/xxx`**: Branches for fixing bugs.
- **`hotfix/xxx`**: For urgent fixes to production.

```
main            ●───────●─────────────────●─────────● (stable releases)
                │       │                 │         │
develop         ●───●───●───●─────●───────●─────●───● (integration)
                │   │       │     │       │     │
feature/a       │   ●───●───●     │       │     │
                │               │         │     │
feature/b       │               ●─────●───●     │
                                              │
feature/c       │                             ●───●
```

## Complete Workflow

### 1. Starting a New Feature

```bash
# Ensure you're on the main branch and it's up to date
git checkout main
git pull origin main

# Create and switch to a new feature branch
git checkout -b feature/your-feature-name

# Start working on your changes
```

### 2. Day-to-Day Development

```bash
# Make your changes
...

# Commit your changes with descriptive messages
git add .
git commit -m "Descriptive message about what changed and why"

# Periodically push your branch to GitHub
git push -u origin feature/your-feature-name
```

### 3. Staying Up to Date with Main

```bash
# Regularly sync with main to reduce merge conflicts
git checkout main
git pull origin main
git checkout feature/your-feature-name
git merge main

# Resolve any conflicts
```

### 4. Creating a Pull Request

See `PULL_REQUEST_GUIDE.md` for detailed instructions on creating PRs.

```bash
# Push your changes
git push origin feature/your-feature-name

# Create a PR on GitHub targeting the 'develop' branch
```

### 5. Code Review Process

1. **Request Reviews**: Assign team members to review your PR
2. **Address Feedback**: Make changes based on review comments
3. **Approval**: Once approved, your PR can be merged by a maintainer

### 6. After Merge

```bash
# Update your local main branch
git checkout main
git pull origin main

# Delete the feature branch (optional)
git branch -d feature/your-feature-name
```

## Release Process

When we're ready to release a new version:

1. Create a PR from `develop` to `main`
2. Review the PR thoroughly
3. After approval, merge to `main`
4. Tag the main branch with a version number
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

## Emergency Hotfixes

For urgent fixes to production:

```bash
# Create a hotfix branch from main
git checkout main
git checkout -b hotfix/critical-issue

# Make your fix, commit, and push
git add .
git commit -m "Fix critical issue X"
git push origin hotfix/critical-issue

# Create a PR targeting main directly
# After approval and merge, sync the fix back to develop
```

## References and Additional Resources

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Detailed contribution guidelines
- [BRANCH_PROTECTION_SETUP.md](./BRANCH_PROTECTION_SETUP.md) - Instructions for setting up branch protection
- [PULL_REQUEST_GUIDE.md](./PULL_REQUEST_GUIDE.md) - Guide to creating and managing PRs

By following this workflow, we ensure:
- Code quality through peer review
- No direct changes to production code
- Parallel development without conflicts
- Clear history of changes and releases 