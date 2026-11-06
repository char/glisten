defmodule Orchard.Worker do
  @moduledoc """
  A small worker for #{inspect(__MODULE__)}.
  """

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  defp handle_item({:ok, value}, state) when is_binary(value) do
    result = value |> String.trim() <> "!"
    {:reply, {:ok, result}, state}
  end

  def handle_item(:error, state), do: {:reply, :"not found", state}
end
