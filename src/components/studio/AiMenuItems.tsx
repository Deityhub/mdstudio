import { Settings2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AI_ACTIONS, type AiActionId } from "@/lib/ai/actions";

/** The AI actions as menu rows, shared by the toolbar menu and the bubble over a selection. */
export function AiMenuItems({
  onPick,
  onIntegrations,
}: {
  onPick: (id: AiActionId) => void;
  onIntegrations: () => void;
}) {
  return (
    <>
      <DropdownMenuLabel>On the selected text</DropdownMenuLabel>
      {AI_ACTIONS.map((a) => (
        <DropdownMenuItem key={a.id} onClick={() => onPick(a.id)}>
          {a.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onIntegrations}>
        <Settings2 className="mr-2 size-4" /> AI integrations…
      </DropdownMenuItem>
    </>
  );
}
