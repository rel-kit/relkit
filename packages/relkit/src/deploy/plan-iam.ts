export interface DeploymentIamStatement {
  readonly capability: string;
  readonly actions: readonly string[];
  /** Stable deployment logical names, never resolved ARNs or secret values. */
  readonly resources: readonly string[];
}

/** Desired isolation metadata retained while the POC uses one shared task role. */
export interface DeploymentFunctionCapability {
  readonly functionId: string;
  readonly capability: string;
  readonly resourceId: string;
  readonly actions: readonly string[];
}

export interface DeploymentIamPlan {
  readonly serviceRole: {
    readonly statements: readonly DeploymentIamStatement[];
  };
  readonly perFunction: readonly DeploymentFunctionCapability[];
}
