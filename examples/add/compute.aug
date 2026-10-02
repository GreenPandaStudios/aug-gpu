import Device and Buffer and openDevice and upload and add and download from gpu

/** Add two lists on a GPU and return copied values. GPU resources stay local. */
calculate(List<float> left, List<float> right) returns List<float>:
    own Device device = openDevice()
    own Buffer first = upload(device, values=left)
    own Buffer second = upload(device, values=right)
    own Buffer result = add(left=first, right=second)
    return download(buffer=result)
