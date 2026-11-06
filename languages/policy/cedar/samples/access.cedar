// Repository readers may inspect shared documents.
@id("read-shared")
permit (
    principal is Example::User,
    action in [Example::Action::"read", Example::Action::"list"],
    resource is Example::Document
)
when {
    resource has visibility &&
    resource.visibility == "shared" &&
    principal.groups.contains("readers")
};
