import { Suspense } from "react";
import { SuspenseChild } from "./SuspenseChild";

export const SuspenseParent = () => {
  return (
    <>
      <Suspense fallback={<>loading...</>}>
        <SuspenseChild />
      </Suspense>
    </>
  );
};
