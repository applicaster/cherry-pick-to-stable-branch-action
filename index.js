const core = require("@actions/core");
const github = require("@actions/github");
const exec = require('@actions/exec');

const gitExecution = async (commands) => {
  return exec.exec('git', commands);
}

async function run() {
  try {
    const token = core.getInput("github-token");
    const octokit = github.getOctokit(token);

    const pr = github.context.payload.pull_request;

    const prTargetBranch = pr.base.ref.replace('refs/heads/', '');

    // run the script only on main branch
    if (prTargetBranch !== 'main') {
      console.log("Skipping for not-main branches");
      return;
    }

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

        // Update  branechs
        core.startGroup('Fetch all branches')
        await gitExecution(['remote', 'update'])
        await gitExecution(['fetch', '--all'])
        core.endGroup()

        // Create branch new branch
        core.startGroup(`Create new branch ${uniqueBranchName} from ${branch}`)
        await gitExecution(['checkout', '-b', uniqueBranchName, `origin/${branch}`])
        core.endGroup()

        // Cherry pick
        core.startGroup('Cherry picking')
        const result = await gitExecution([
          'cherry-pick',
          '-m',
          '1',
          '--strategy=recursive',
          '--strategy-option=theirs',
          `${pr.merge_commit_sha}`
        ])

        if (result.exitCode !== 0 && !result.stderr.includes(CHERRYPICK_EMPTY)) {
          throw new Error(`Unexpected error: ${result.stderr}`)
        }
        core.endGroup()

        // Push new branch
        core.startGroup('Push new branch to remote')
        await gitExecution(['push', '-u', 'origin', `${uniqueBranchName}`])
        core.endGroup()

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
        core.setFailed(error.message); // Set failure status

      }
    }
  } catch (error) {
    console.error("An error occurred:");
    console.error(error);
    core.setFailed(error.message); // Set failure status

  }
}

run();
