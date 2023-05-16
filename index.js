const core = require("@actions/core");
const github = require("@actions/github");

async function run() {
    try {
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

        for (const branch of targetBranches) {
            try {
                console.log(`Creating new branch ${branch}-cherry-pick`);
                const newBranchRef = await octokit.rest.git.createRef({
                    owner: github.context.repo.owner,
                    repo: github.context.repo.repo,
                    ref: `refs/heads/${branch}-cherry-pick`,
                    sha: pr.head.sha,
                });

                console.log(`Cherry-picking commit onto ${branch}-cherry-pick`);
                await octokit.rest.git.createCommit({
                    owner: github.context.repo.owner,
                    repo: github.context.repo.repo,
                    message: `Cherry-pick ${pr.number} to ${branch}`,
                    parents: [newBranchRef.data.object.sha],
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
                    head: `${github.context.repo.owner}:${branch}-cherry-pick`,
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
        }
    } catch (error) {
        console.error("An error occurred:");
        console.error(error);
    }
}
