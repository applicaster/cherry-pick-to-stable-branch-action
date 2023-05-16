const core = require("@actions/core");
const github = require("@actions/github");

const token = core.getInput("github-token");
const octokit = github.getOctokit(token);

const pr = github.context.payload.pull_request;
const labels = pr.labels.map((label) => label.name);
let targetBranches = [];

// Extract version number from labels and construct target branches
labels.forEach((label) => {
    const versionMatch = label.match(/^v(\d+)$/);
    if (versionMatch) {
        const versionNumber = versionMatch[1];
        const targetBranch = `release/version-${versionNumber}`;
        targetBranches.push(targetBranch);
    }
});
// Cherry-pick and create pull requests for each target branch
targetBranches.forEach(async (branch) => {
    try {
        console.log(`Creating cherry-pick commit to ${branch}`);
        const { data: commit } = await octokit.rest.git.createCommit({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            message: `Cherry-pick ${pr.number} to ${branch}`,
            parents: [pr.merge_commit_sha],
            tree: pr.head.sha,
        });

        console.log(`Creating pull request to ${branch}`);
        const originalPR = await octokit.rest.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: pr.number,
        });

        await octokit.rest.pulls.create({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            title: originalPR.data.title,
            head: commit.sha,
            base: branch,
        });

        console.log(
            `Cherry-pick and pull request creation for ${branch} completed successfully`
        );
    } catch (error) {
        console.error(
            `Error occurred while cherry-picking and creating pull request for ${branch}`
        );
        console.error(error);
    }
});
