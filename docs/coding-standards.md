# Coding Standards

## Quick Reference

- **Format code**: `bun run fix`
- **Check for issues**: `bun run check`

## Core Principles

- Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.
- **Meaningful naming**: Use descriptive names for functions, variables, and types
- **Documentation**: Add comments for complex logic, but prefer self-documenting code

## Style

- Separate logical paragraphs inside a function with a blank line: declarations from the statements that use them, guard clauses from each other, side-effect assignments from the following `return`. Tight one-liners can stay together.
- No single-letter variable names. Use descriptive names, even in callbacks: `items.map(item => ...)` not `items.map(i => ...)`
- Name event-handler parameters `event`, not `e`: `onChange={(event) => ...}`, `onSubmit={(event) => ...}`.
- Import paths: relative is fine up to one level up — `./sibling` and `../sibling` are allowed. Two or more levels up (`../../` or deeper) must use the `@cli`/`@api`/`@core`/`@client`/`@shared` aliases instead.

## React

- Prefer inline prop types on the component signature over a standalone `Props` interface: `function Foo({ name }: { name: string })`. Only extract a named interface when the props are reused or the inline shape becomes unwieldy.

## Comments

- **Default to none:** let names, types, and structure carry the meaning. Comment only when something stays non-obvious after the code is as clear as you can make it — and try renaming or extracting first.
- **Comment the why, not the what.** A comment earns its place when it explains something the code can't: a workaround for an external quirk, a domain rule the types don't show, a non-obvious security/performance constraint, or a deliberate trade-off that looks wrong without context.
- **Don't restate or duplicate.** Don't restate the code. Don't re-explain what an ADR or doc already records — reference it (e.g. `@see docs/adr/0007-...`) so it stays in sync. Avoid references that go stale: PR numbers, issue IDs, "new" or "temporary."
- **Format comments as JSDoc.** Use @param/@returns/@throws/@example/@deprecated where they add information beyond the signature; skip tags that just echo the types. Reference an ADR or doc with @see <path|url>, never prose.

## Libraries

- Reach for an installed utility before hand-rolling one. Don't reimplement array, object, string, or date logic by hand when a helper already exists.
- `radashi` for array, object, and string helpers. Reach for it before writing a manual `reduce`/`filter`/`map` that a named helper already covers.
- `date-fns` for all date formatting and arithmetic. Don't format or compare dates with manual string slicing or raw `Date` maths.
- Don't trust training data for these APIs; signatures move between versions. Use the `find-docs` skill to confirm current usage before writing.

## Errors & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

## Architecture

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Deep Modules

Prefer deep modules: small interface, deep implementation. A few methods with simple params hiding complex logic behind them.

Avoid shallow modules: large interface with many methods that just pass through to thin implementation. When designing, ask: can I reduce the number of methods? Can I simplify the parameters? Can I hide more complexity inside?

### Design for Testability

1. **Accept dependencies, don't create them:** pass external dependencies in rather than constructing them internally.
2. **Return results, don't produce side effects:** a function that returns a value is easier to test than one that mutates state.
3. **Small surface area:** fewer methods = fewer tests needed, fewer params = simpler test setup.
