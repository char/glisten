// A policy template bound to a principal and a resource.
@id("assigned-owner")
permit (
    principal == ?principal,
    action == App::Action::"update",
    resource == ?resource
)
when {
    resource.name like "report-*" &&
    resource.tags.containsAll(["approved", "signed"]) &&
    decimal("12.50").lessThan(decimal("99.00")) &&
    context.details == { label: "line\nnext", note: "first line
second line", enabled: true, count: 3 }
};
