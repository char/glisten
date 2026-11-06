import { wat } from "./mod.ts";
if (false) {
  // @ts-expect-error strings must use raw() explicitly
  wat`${"not WAT"}`;
}
