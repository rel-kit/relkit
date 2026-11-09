/**
 * Native Promise gate used to control external completion without wall-clock sleeps.
 * @typeParam A - Successful native value released by the test's explicit completion authority.
 */
export interface NativeGate<A> {
  readonly promise: Promise<A>;
  readonly resolve: (value: A) => void;
  readonly reject: (error: unknown) => void;
}
