import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChooseCloudDrafts } from "@/components/studio/CloudDialogs";
import { ManageImages } from "@/components/studio/ManageImages";
import { useAccount } from "@/lib/account/store";
import { type GithubStatus, connectUrl, githubApi } from "@/lib/github/api";
import { useCloud } from "@/lib/sync/hooks";
import { SettingsRow } from "./SettingsRow";

/** What the account reaches beyond this device: cloud drafts, hosted images, GitHub. */
export function ConnectionsSection({ userId }: { userId: string }) {
  const account = useAccount();
  const cloud = useCloud();
  const [picker, setPicker] = useState(false);
  const [images, setImages] = useState(false);
  const [github, setGithub] = useState<GithubStatus | null>(null);
  useEffect(() => {
    if (account.githubPublish) githubApi.status().then(setGithub, () => setGithub(null));
  }, [account.githubPublish]);

  return (
    <section aria-label="Connections">
      <SettingsRow
        title="Cloud drafts"
        description={`${cloud.linked.size} of ${cloud.limit} drafts are kept in your account and synced between devices.`}
      >
        <Button variant="outline" size="sm" onClick={() => setPicker(true)}>
          Choose drafts…
        </Button>
      </SettingsRow>
      {account.images && (
        <SettingsRow title="Hosted images" description="The images you uploaded to this server.">
          <Button variant="outline" size="sm" onClick={() => setImages(true)}>
            Manage images…
          </Button>
        </SettingsRow>
      )}
      {account.githubPublish && (
        <SettingsRow
          title="GitHub publishing"
          description={
            github?.connected
              ? `Connected as ${github.login}${github.private ? " (private repositories allowed)" : ""}.`
              : "Connect to publish a draft as a commit, pull request or gist."
          }
        >
          {github?.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await githubApi.disconnect();
                  setGithub({ ...github, connected: false });
                  toast.success("GitHub disconnected");
                } catch {
                  toast.error("Couldn't disconnect GitHub");
                }
              }}
            >
              Disconnect
            </Button>
          ) : (
            github?.available && (
              <Button asChild variant="outline" size="sm">
                <a href={connectUrl(false)}>Connect</a>
              </Button>
            )
          )}
        </SettingsRow>
      )}
      <ChooseCloudDrafts userId={userId} open={picker} onOpenChange={setPicker} />
      <ManageImages open={images} onOpenChange={setImages} />
    </section>
  );
}
