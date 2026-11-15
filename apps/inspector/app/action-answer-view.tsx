"use client";

import Link from "next/link";
import { forwardRef, type ReactNode } from "react";
import { issueWords, type ActionAnswer } from "../lib/action-answer";

/**
 * The outcome of an action that did not run, in words, shown beside the control that caused it:
 * the application's status, a link to a declared error's contract, and the fields that failed.
 */
export const ActionAnswerView = forwardRef<
  HTMLDivElement,
  { readonly answer: ActionAnswer; readonly id?: string; readonly children?: ReactNode }
>(function ActionAnswerView({ answer, id, children }, ref) {
  return (
    <div
      ref={ref}
      id={id}
      role="alert"
      tabIndex={-1}
      className="grid min-w-0 gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger outline-none"
    >
      <p className="m-0 max-w-none">{answer.text}</p>
      {answer.errorId === undefined ? null : (
        <p className="m-0 text-foreground">
          Declared error{" "}
          <Link
            className="text-link font-mono break-all"
            href={`/errors/${encodeURIComponent(answer.errorId)}`}
          >
            {answer.errorId}
          </Link>
          . Open it to see how the application declares it.
        </p>
      )}
      {answer.issues === undefined || answer.issues.length === 0 ? null : (
        <table className="w-full min-w-0 border-collapse text-left text-foreground">
          <caption className="sr-only">Fields that failed validation</caption>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">
                Field
              </th>
              <th scope="col" className="py-1 font-medium">
                Problem
              </th>
            </tr>
          </thead>
          <tbody>
            {answer.issues.map((issue, index) => (
              <tr key={index} className="border-b border-border/60 last:border-b-0">
                <td className="py-1 pr-3 font-mono break-all">
                  {issue.path === "" ? <span className="font-sans">Whole input</span> : issue.path}
                </td>
                <td className="py-1">{issueWords(issue.code)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {children}
    </div>
  );
});
