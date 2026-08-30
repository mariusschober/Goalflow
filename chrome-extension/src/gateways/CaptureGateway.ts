// Placeholder for tranche D — captures remain interface-only in A.
export interface CaptureGateway { capture(title: string, opts?: { withPageContext?: boolean }): Promise<void>; }
export class StubCaptureGateway implements CaptureGateway {
  async capture(_title: string): Promise<void> { throw new Error('Capture not yet implemented (tranche D)'); }
}
