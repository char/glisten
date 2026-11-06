#nullable enable
using System;
using System.Linq;
[assembly: CLSCompliant(true)]

/// <summary>Example documentation remains a comment.</summary>
public record Person(string Name, int Age)
{
    public required string Id { get; init; }
    public static async Task<string> Describe(Person person)
    {
        var query = from x in new[] { person } where x.Age > 18 select x.Name;
        await Task.Yield();
        return $"Name: {person.Name,-10:upper}, age {person.Age + 1}";
    }
}
