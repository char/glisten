#if DEBUG
#region Examples
#pragma warning disable CS0168
#nullable enable
[Obsolete("use Newer")]
public class Example<T> where T : class
{
    private readonly int mask = 0xFF_00u;
    private long flags = 0b1010_0011L;
    decimal ratio = 12.5m;
    public int? Value { get; set; }
    public string Render(T item) => item?.ToString() ?? "none";
    public Func<int, int> Twice = n => n * 2;
    public void M() { var @class = 1; Console.WriteLine(@class); }
}
#endregion
#endif
