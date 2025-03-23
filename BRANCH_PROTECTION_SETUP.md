# Setting Up Branch Protection Rules for SOLidify

This guide will help you set up branch protection rules in GitHub to ensure collaborative development follows proper review processes.

## Steps to Set Up Branch Protection Rules

### 1. Navigate to Repository Settings

1. Go to the GitHub repository at https://github.com/steccomeno/SOLidify
2. Click on the **Settings** tab (you need to be an owner or administrator of the repository)

### 2. Access Branch Protection Settings

1. In the left sidebar under "Code and automation", click on **Branches**
2. Under "Branch protection rules", click the **Add rule** button

### 3. Configure Protection for `main` Branch

1. In the "Branch name pattern" field, enter `main`
2. Configure the following recommended settings:
   
   - **Require a pull request before merging** ✓
     - **Require approvals** ✓
     - Set "Required number of approvals" to at least 1
     - **Dismiss stale pull request approvals when new commits are pushed** ✓
   
   - **Require status checks to pass before merging** ✓
     - Search for and enable any CI checks you have configured
   
   - **Require conversation resolution before merging** ✓
   
   - **Do not allow bypassing the above settings** ✓

3. Click **Create** to save the rule for the `main` branch

### 4. Configure Protection for `develop` Branch

1. Click **Add rule** again
2. In the "Branch name pattern" field, enter `develop`
3. Configure similar settings as for the `main` branch
4. Click **Create** to save the rule

## How These Rules Help

- **Prevent direct pushes**: No one can push directly to protected branches
- **Ensure code review**: All changes must go through pull requests with required reviews
- **Maintain quality**: Status checks must pass before merging
- **Resolve discussions**: All conversations must be resolved before merging

## Working with Protected Branches

Now that your branches are protected, your team will follow this workflow:

1. Create feature branches from `develop` using the naming convention `feature/your-feature-name`
2. Make changes in these feature branches
3. Create Pull Requests to `develop` for integration
4. Ensure the PR receives the required approvals
5. Merge approved PRs to `develop`
6. When ready for release, create a PR from `develop` to `main`

This workflow ensures that code is properly reviewed before being merged to important branches, helping maintain code quality and preventing accidental changes. 