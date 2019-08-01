declare module "external-ip" {
  export default function module(config?: {
    services: string[];
    replace: boolean;
    timeout: number;
    getIP: "sequential" | "parallel";
    userAgent: string;
    verbose: boolean;
  }): (callback: (error: Error, ip: string) => void) => void;
}
