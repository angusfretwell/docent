import { reviewQueryOptions } from "@client/queries/review";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

const APP_NAME = "Docent";

export function useDocumentTitle(): void {
  const { data: snapshot } = useQuery(reviewQueryOptions);
  const title = snapshot?.review.title;

  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
