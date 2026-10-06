// aug-spec: "main.aug.md" explains this file. Read it before changes; refresh with aug spec.
import calculate from compute
import GpuError from gpu

try:
    scope:
        first = start worker calculate(left=[1.0, 2.0, 3.0], right=[4.0, 5.0, 6.0])
        second = start worker calculate(left=[10.0, 20.0], right=[1.0, 2.0])
        wait for first and second as firstResult and secondResult
        for value in firstResult:
            print(value)
        for value in secondResult:
            print(value)
catch GpuError error:
    print(value=error.explain())
catch ConcurrencyError error:
    print(value="Worker capacity is exhausted")
