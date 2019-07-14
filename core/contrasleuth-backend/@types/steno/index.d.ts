declare module "steno" {
  export function writeFile(
    file: string,
    data: string | Buffer,
    callback: (error: Error) => void
  ): void;

  export function writeFileSync(file: string, data: string | Buffer): void;
}
