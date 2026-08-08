const repository = {
  full_name: 'deployradar/github-actions-integration',
  html_url: 'https://github.com/deployradar/github-actions-integration',
  name: 'github-actions-integration'
}

const pushPayload = {
  repository,
  deleted: false,
  head_commit: {
    message: 'Deploy aurora gateway',
    timestamp: '2026-08-08T13:30:00Z'
  }
}

export const pushContext = {
  eventName: 'push',
  sha: 'c9976f8f9bf3f0f2c0ab45a744a6e2c6c143b387',
  ref: 'refs/heads/main',
  workflow: 'Deploy application',
  action: 'deployradar',
  actor: 'fwende',
  job: 'deploy',
  runNumber: 42,
  runId: 21005190829,
  serverUrl: 'https://github.com',
  payload: pushPayload
}

export const deletedPushContext = {
  ...pushContext,
  payload: {
    ...pushPayload,
    deleted: true,
    head_commit: null
  }
}

// GitHub associates the github context of a reusable workflow with its caller.
export const workflowCallFromPushContext = {
  ...pushContext,
  workflow: 'Caller deployment workflow',
  job: 'deploy-from-reusable-workflow',
  runNumber: 43,
  runId: 21005190830
}
