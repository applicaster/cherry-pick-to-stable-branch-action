const core = require("@actions/core");
const github = require("@actions/github");
const exec = require('@actions/exec');

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
        const uniqueBranchName = `${branch}-cherry-pick-${Date.now()}`;


        await exec.exec('git', ['fetch', 'origin', branch]); // Fetch the target branch from the remote repository
        await exec.exec('git', ['checkout', branch]);
        await exec.exec('git', ['checkout', '-b', uniqueBranchName]);
        await exec.exec('git', ['cherry-pick', pr.merge_commit_sha]);

        let hasConflicts = false;
        const options = {
          listeners: {
            stderr: (data) => {
              if (data.includes('CONFLICT')) {
                hasConflicts = true;
              }
            },
          },
        };

        await exec.exec('git', ['diff', '--check'], options);

        if (hasConflicts) {
          console.log(`Conflicts detected for ${pr.merge_commit_sha}. Cherry-pick aborted.`);
        } else {
          await exec.exec('git', ['push', 'origin', uniqueBranchName]);

          await octokit.rest.pulls.create({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            title: pr.title,
            head: `${github.context.repo.owner}:${uniqueBranchName}`,
            base: branch,
          });

          console.log(`Cherry-pick and pull request creation for ${branch} completed successfully`);
        }
      } catch (error) {
        console.error(`Error occurred while cherry-picking and creating pull request for ${branch}`);
        console.error(error);
      }
    }
  } catch (error) {
    console.error("An error occurred:");
    console.error(error);
  }
}

run();
