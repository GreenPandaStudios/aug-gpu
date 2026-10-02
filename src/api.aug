// aug-spec: "api.aug.md" explains this file. Read it before changes; refresh with aug spec.
import Device and Buffer from bindings
import GpuError from contracts
extern C _open() returns own Device unless GpuError
extern C _upload(Device device, List<float> values) returns own Buffer unless GpuError
extern C _add(Buffer left, Buffer right) returns own Buffer unless GpuError
extern C _download(Buffer buffer) returns List<float> unless GpuError
extern C _live() returns int
/** Open a Metal GPU on the current worker. No device means GpuError. */
openDevice() returns own Device:
    unsafe:
        return _open()
/** Copy finite numbers to an owned float32 GPU buffer. Values round to float32. */
upload(Device device, List<float> values) returns own Buffer:
    unsafe:
        return _upload(device, values)
/** Add equally sized buffers on the GPU. Wait for device completion before returning. */
add(Buffer left, Buffer right) returns own Buffer:
    unsafe:
        return _add(left, right)
/** Copy float32 GPU values into an August list of floats. */
download(Buffer buffer):
    unsafe:
        return _download(buffer)

test openDevice:
    when metal:
        it adds_on_the_gpu_and_releases_every_resource:
            int before = 0
            unsafe:
                before = _live()
            scope:
                own Device device = openDevice()
                own Buffer left = upload(device, values=[1.0, 2.0, 3.0])
                own Buffer right = upload(device, values=[4.0, 5.0, 6.0])
                own Buffer result = add(left, right)
                output = download(buffer=result)
                assert(output.get(index=0) == 5.0)
                assert(output.get(index=1) == 7.0)
                assert(output.get(index=2) == 9.0)
            unsafe:
                assert(_live() == before)
        it cleans_up_when_an_operation_fails:
            try:
                scope:
                    own Device device = openDevice()
                    own Buffer left = upload(device, values=[1.0])
                    own Buffer right = upload(device, values=[2.0, 3.0])
                    own Buffer result = add(left, right)
                    assert(false)
            catch GpuError error:
                assert(error.code == 2)
            unsafe:
                assert(_live() == 0)
