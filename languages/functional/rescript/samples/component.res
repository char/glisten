// Render a greeting with a nested component.
@react.component
let make = (~name: string, ~active=true) => {
  let title = if active { `Hello, ${name}!` } else { "Welcome" }
  <section className="card">
    <Heading text={title} />
    <span> {React.string(name)} </span>
  </section>
}
