# Contributing to Hashgraph Online Standards SDK

Thank you for your interest in contributing to the Hashgraph Online Standards SDK!

We appreciate your interest in helping us and the rest of our community. We welcome bug reports, feature requests, and code contributions.

**Jump To:**

- [Contributing to Hashgraph Online Standards SDK](#contributing-to-hashgraph-online-standards-sdk)
  - [Bug Reports](#bug-reports)
    - [Before Submitting a Bug Report](#before-submitting-a-bug-report)
    - [Submitting a Bug Report](#submitting-a-bug-report)
  - [Feature Requests](#feature-requests)
    - [Submitting a Feature Request](#submitting-a-feature-request)
  - [Code Contributions](#code-contributions)
  - [Development Setup](#development-setup)
  - [Pull Request Process](#pull-request-process)
    - [Branch Naming Conventions](#branch-naming-conventions)
    - [Commit Message Conventions](#commit-message-conventions)
    - [Pull Request Naming](#pull-request-naming)
    - [Pull Request Readiness](#pull-request-readiness)
    - [Developer Certificate of Origin (DCO)](#developer-certificate-of-origin-dco)
    - [Getting Your Pull Request Merged](#getting-your-pull-request-merged)
  - [Code of Conduct](#code-of-conduct)
  - [Getting in Contact](#getting-in-contact)

## Bug Reports

Bug reports are accepted through the [Issues](https://github.com/hashgraph-online/standards-sdk/issues) page.

The `bug` label is used to track bugs.

### Before Submitting a Bug Report

Before submitting a bug report, please do the following:

1. Do a search through the existing issues to make sure it has not already been reported. If you find that the bug has already been raised, please give it a +1 to help us decide which issues we prioritize.

2. If possible, upgrade to the latest release of the SDK. It's possible the bug has already been fixed in the latest version.

If you have completed these steps and you need to submit a bug report, please read the guidelines below.

### Submitting a Bug Report

Please ensure that your bug report contains the following:

- A short, descriptive title. Other community members should be able to understand the nature of the issue by reading this title.
- A succinct, detailed description of the problem you're experiencing. This should include:
  - Expected behavior of the SDK and the actual behavior exhibited.
  - Any details of your application development environment that may be relevant.
  - If applicable, the exception stack-trace.
  - If you are able to create one, include a Minimal Working Example that reproduces the issue.
- Markdown formatting as appropriate to make the report easier to read; for example, use code blocks when pasting a code snippet or exception stack-trace.

We provide an issue template to help you submit bug reports.

## Feature Requests

Feature requests are also submitted through the [Issues](https://github.com/hashgraph-online/standards-sdk/issues) page.

As with Bug Reports, please do a search of the open requests first before submitting a new one to avoid duplicates. If you do find a feature request that represents your suggestion, please give it a +1.

**NOTE:** If you intend to implement this feature, please submit the feature request _before_ working on any code changes. This will allow members of the SDK team to assess the idea, discuss the design with you, and ensure that it makes sense to include such a feature in the SDK.

Feature requests are labeled as `enhancement`.

### Submitting a Feature Request

Open an [issue](https://github.com/hashgraph-online/standards-sdk/issues) with the following:

- A short, descriptive title. Other community members should be able to understand the nature of the issue by reading this title.
- A detailed description of the proposed feature. Explain why you believe it should be added to the SDK. Illustrative example code may also be provided to help explain how the feature should work.
- Markdown formatting as appropriate to make the request easier to read.
- If you plan to implement this feature yourself, please let us know that you'd like the issue to be assigned to you.

We provide an issue template to help you submit feature requests.

## Code Contributions

Code contributions to the SDK are handled using Pull Requests. Please keep the following in mind when considering a code contribution:

- The SDK is released under the [Apache 2.0 License](LICENSE).

  Any code you submit will be released under this license.

- For anything other than small or quick changes, you should always start by reviewing the [Issues](https://github.com/hashgraph-online/standards-sdk/issues) page to ensure that nobody else is already working on the same issue.

  If you're working on a bug fix, check to see whether the bug has already been reported. If it has but no one is assigned to it, ask one of the maintainers to assign it to you before beginning work. If you're confident the bug hasn't been reported yet, create a new Bug Report and ask us to assign it to you.

  If you are thinking about adding entirely new functionality, open a Feature Request to ask for feedback first before beginning work; this is to ensure that nobody else is already working on the feature (or another similar feature) and to confirm that it makes sense for such functionality to be included in the SDK.

- All code contributions must be accompanied with new or modified tests that verify that the code works as expected; i.e., that the issue has been fixed or that the functionality works as intended.

## Development Setup

```bash
# Clone your fork
git clone https://github.com/[your-username]/standards-sdk.git

# Navigate to the project directory
cd standards-sdk

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Build the project
npm run build
```

## Pull Request Process

### Branch Naming Conventions

Branch names should clearly indicate the type of work being done. Follow this format:

- `bug/fix-short-description` - For bug fixes
- `feat/feature-short-description` - For new features
- `docs-short-description` - For documentation changes
- `chore-short-description` - For maintenance tasks
- `refactor-short-description` - For code refactoring
- `test-short-description` - For adding or modifying tests
- `style-short-description` - For formatting changes

Use hyphens to separate words in the description.

Examples:

- `bug/fix-token-validation`
- `feature-add-hcs12-support`
- `docs-update-installation-guide`

### Commit Message Conventions

We follow the Conventional Commits specification for commit messages. Each commit message should be structured as follows:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types:

- `fix:` - Bug fixes (correlates with PATCH in semantic versioning)
- `feat:` - New features (correlates with MINOR in semantic versioning)
- `docs:` - Documentation only changes
- `style:` - Changes that don't affect the code's meaning (white-space, formatting, etc.)
- `refactor:` - Code changes that neither fix bugs nor add features
- `perf:` - Changes that improve performance
- `test:` - Adding or correcting tests
- `chore:` - Changes to the build process or auxiliary tools

Examples:

```
feat(sdk): add support for custom topic creation

This allows users to create topics with custom properties.

Closes #123
```

```
fix: address memory leak in connection pooling

The connection wasn't being properly closed when an error occurred.

Fixes #456
```

Breaking changes should be indicated by adding `BREAKING CHANGE:` in the footer or appending a `!` after the type/scope:

```
feat!: drop support for Node 12

BREAKING CHANGE: Use of new features requires Node 14 or higher.
```

### Pull Request Naming

Pull request titles should follow the same format as commit messages:

- `bug: Short description` - For bug fixes
- `feat: Short description` - For new features
- `docs: Short description` - For documentation changes
- `chore: Short description` - For maintenance tasks
- `refactor: Short description` - For code refactoring
- `test: Short description` - For adding or modifying tests
- `style: Short description` - For formatting changes
- `perf: Short description` - For performance improvements

Examples:

- `bug: Fix token validation in authentication flow`
- `feat: Add support for HCS-12 standard`
- `docs: Update installation instructions`

Include the issue number in the PR description rather than the title, using "Fixes #123" or "Closes #456" syntax to automatically link the PR to the issue.

### Pull Request Readiness

Before submitting your pull request, refer to the pull request readiness checklist below:

- [ ] Includes tests to exercise the new behavior
- [ ] Code is documented, especially public and user-facing constructs
- [ ] Local run of `npm run build`, `npm test` and linting passes
- [ ] Git commit message is detailed and includes context behind the change
- [ ] If the change is related to an existing Bug Report or Feature Request, please include its issue number
- [ ] All commits include a DCO sign-off (see below)

To contribute, please fork the GitHub repository and submit a pull request to the `main` branch.

### Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/) (DCO) to certify that contributors have the right to submit their contributions. The DCO is a lightweight alternative to a Contributor License Agreement (CLA).

All contributions to this project must be signed off using the `-s` flag:

```bash
git commit -s -m "Your commit message"
```

This adds a Signed-off-by line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

The sign-off certifies that you have the right to contribute the code according to the [DCO](https://developercertificate.org/) terms.

We use the DCO GitHub App to automatically check that all commits in a PR include a valid DCO sign-off. If you forget to sign off on a commit, you can amend it:

```bash
git commit --amend -s
git push -f origin your-branch-name
```

### Getting Your Pull Request Merged

All Pull Requests must be approved by at least one member of the SDK team before it can be merged in. The team members only have limited bandwidth to review Pull Requests, so it's not unusual for a Pull Request to go unreviewed for a few days, especially if it's a large or complex one.

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing to this project.

## Getting in Contact

- Join our [Telegram Community](https://t.me/hashinals)
