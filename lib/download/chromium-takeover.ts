export function startChromiumTakeover(
  cancel: () => Promise<void>,
  continueTakeover: (cancellation: Promise<void>) => Promise<void>,
  onError: (error: unknown) => void,
): void {
  let cancellation: Promise<void>;
  try {
    cancellation = cancel();
  } catch (error) {
    onError(error);
    return;
  }

  void continueTakeover(cancellation).catch(onError);
}
