import { NeedsApplication } from "../application-state";
import { EnvironmentClient } from "../environment-client";

export default function EnvironmentPage() {
  return (
    <NeedsApplication page="Environment">
      <EnvironmentClient />
    </NeedsApplication>
  );
}
