type Content = {
  revision: number;
  body: string;
  links: string[];
  asset_ids: string[];
};
/** Retain the request ID when retrying identical content after an uncertain response. */
export class SubmissionPacket {
  private fingerprint = "";
  private requestId = "";
  constructor(
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}
  for(content: Content) {
    const fingerprint = JSON.stringify(content);
    if (fingerprint !== this.fingerprint) {
      this.fingerprint = fingerprint;
      this.requestId = this.createId();
    }
    return { ...content, request_id: this.requestId };
  }
}
