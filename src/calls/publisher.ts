// Lets the calls runtime push workflow updates through the live workflow engine (set by workflow/index.ts).
type Publish = (workflowId: string) => Promise<unknown>;
let publisher: Publish | null = null;

export function setWorkflowPublisher(p: Publish | null): void { publisher = p; }

export async function publishWorkflow(workflowId: string): Promise<void> {
  if (publisher) await publisher(workflowId);
}
