# Coding Standards

## Style

- No single-letter variable names. Use descriptive names, even in callbacks: `items.map(item => ...)` not `items.map(i => ...)`
- Name event-handler parameters `event`, not `e`: `onChange={(event) => ...}`, `onSubmit={(event) => ...}`.
- Separate logical paragraphs inside a function with a blank line: declarations from the statements that use them, guard clauses from each other, side-effect assignments from the following `return`. Tight one-liners can stay together.

## React

- Prefer inline prop types on the component signature over a standalone `Props` interface: `function Foo({ name }: { name: string })`. Only extract a named interface when the props are reused or the inline shape becomes unwieldy.

## Libraries

- Reach for an installed utility before hand-rolling one. Don't reimplement array, object, string, date, or pluralisation logic by hand when a helper already exists.
- `radashi` for array, object, and string helpers: `unique`, `sift`, `pick`, `mapValues`, `range`, `title`, `isString`, etc. Reach for it before writing a manual `reduce`/`filter`/`map` that a named helper already covers.
- `date-fns` for all date formatting and arithmetic: `format`, `formatISO`, `formatDistanceStrict`, `parse`, `isValid`, `addDays`, `subDays`. Don't format or compare dates with manual string slicing or raw `Date` maths.
- Don't trust training data for these APIs; signatures move between versions. Use the `find-docs` skill to confirm current usage before writing.

## Testing

### Core Principle

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't break unless behavior changed.

### Good Tests

Integration-style tests that exercise real code paths through public APIs. They describe _what_ the system does, not _how_.

```typescript
// GOOD: Tests observable behavior through the public interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

- Test behavior users/callers care about
- Use the public API only
- Survive internal refactors
- One logical assertion per test
- Follow arrange/act/assert, with a blank line between each phase

### Bad Tests

```typescript
// BAD: Mocks internal collaborator, tests HOW not WHAT
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});

// BAD: Bypasses the interface to verify via database
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});
```

```typescript
// BAD: Test restates the implementation — the function IS the spec
test("pitchHref includes from param", () => {
  expect(pitchHref("abc")).toBe("/pitches/abc?from=deliverables");
});
```

Red flags:

- Mocking internal collaborators (your own classes/modules)
- Testing private methods
- Asserting on call counts/order of internal calls
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means (e.g. querying a DB) instead of through the interface
- Testing a trivial function (one-liner, simple mapping, string concatenation) where the test just mirrors the code — these tests add no confidence and break on any refactor
- Thin delegation tests for route handlers — when a route's only job is to parse input and call a service method, testing that it "delegates correctly" by mocking the service duplicates the route code in the test. The real behavior lives in the service; test that instead.

### Mocking

Mock at **system boundaries** only:

- External APIs (payment, email, etc.)
- Time/randomness
- File system or databases when a real instance isn't practical

**Never mock your own classes/modules or internal collaborators.** If something is hard to test without mocking internals, redesign the interface.

Prefer SDK-style interfaces over generic fetchers at boundaries — each function is independently mockable with a single return shape, no conditional logic in test setup.

## Architecture

### Deep Modules

Prefer deep modules: small interface, deep implementation. A few methods with simple params hiding complex logic behind them.

Avoid shallow modules: large interface with many methods that just pass through to thin implementation. When designing, ask: can I reduce the number of methods? Can I simplify the parameters? Can I hide more complexity inside?

### Design for Testability

1. **Accept dependencies, don't create them** — pass external dependencies in rather than constructing them internally.
2. **Return results, don't produce side effects** — a function that returns a value is easier to test than one that mutates state.
3. **Small surface area** — fewer methods = fewer tests needed, fewer params = simpler test setup.
