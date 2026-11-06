@id("block-external")
forbid (
    principal,
    action == App::Action::"write",
    resource
)
when {
    context has sourceIp &&
    !ip(context.sourceIp).isInRange(ip("10.0.0.0/8"))
}
unless {
    context has emergency && context.emergency == true
};
