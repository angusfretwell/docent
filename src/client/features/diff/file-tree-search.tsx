import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@client/components/ui/input-group";
import { Kbd } from "@client/components/ui/kbd";
import type { FileTree } from "@pierre/trees";
import { useFileTreeSearch } from "@pierre/trees/react";
import { SearchIcon } from "lucide-react";
import { useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

export function FileTreeSearch({ model }: { model: FileTree }) {
  const search = useFileTreeSearch(model);
  const ref = useRef<HTMLInputElement>(null);

  useHotkeys("t", () => ref.current?.focus(), {
    preventDefault: true,
  });

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown": {
        search.focusNextMatch();
        break;
      }
      case "ArrowUp": {
        search.focusPreviousMatch();
        break;
      }
      case "Enter": {
        for (const path of model.getSelectedPaths()) {
          model.getItem(path)?.deselect();
        }
        model.getFocusedItem()?.select();
        search.close();
        break;
      }
      case "Escape": {
        if (!search.value) {
          search.close();
          ref.current?.blur();
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  return (
    <InputGroup className="isolate">
      <InputGroupInput
        ref={ref}
        aria-label="Search"
        placeholder="Search"
        type="search"
        size="sm"
        value={search.value}
        onChange={(event) => search.setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <Kbd>T</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}
