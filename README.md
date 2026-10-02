# August GPU

Run float32 vector operations on a Metal GPU through ordinary August imports. The native C ABI owns its devices and buffers, waits for submitted work to complete, and copies downloaded values into August memory. GPU handles remain on their creating worker. There is no CPU fallback.

This first release supports Apple Silicon with macOS 14 or later and an available Metal GPU. Consumers download a prebuilt adapter and need no Xcode or native compiler. Authoring the adapter requires the macOS SDK. NVIDIA CUDA support needs a separate artifact and real hardware qualification; it is not included in this release.

Requires August 0.22.0, the preview containing isolated workers. The compiler release is prepared separately; use its reviewed candidate until npm publication.

## Use the package

Add the repository through the ordinary package manager:

```sh
aug add https://github.com/GreenPandaStudios/aug-gpu#v0.1.0 --as gpu
aug run
```

The release archive contains the prebuilt C adapter. Commit `aug.lock.json` to keep the source commit, descriptor and native archive pinned. An unsupported platform, missing artifact or unavailable GPU raises an explicit error. Source builds run only as a maintainer action.

```aug
import Device and Buffer and openDevice and upload and add and download from gpu

calculate(List<float> left, List<float> right):
    own Device device = openDevice()
    own Buffer first = upload(device, values=left)
    own Buffer second = upload(device, values=right)
    own Buffer result = add(left=first, right=second)
    return download(buffer=result)
```

`upload` rounds finite August floats to float32. `add` requires equal lengths and devices. `download` returns those float32 values as August floats. The functions infer `GpuError`; handle it at a wait or scope boundary. Device and buffer cleanup runs on their creating thread, including checked failures and task cancellation. A running native operation finishes before cancellation takes effect.

For maintainer builds, run `node native/build.mjs`. It builds and tests the real Metal adapter, records its source identity and dynamic dependencies, produces a release archive, and updates measured artifact hashes. Review those pins, run the August package tests and worker example with the candidate compiler, and publish an immutable source tag and matching archive. Package installation never runs this build script.

Metal executes the compute commands; the adapter waits for completion before exposing results. See [Apple's command execution model](https://developer.apple.com/library/archive/documentation/Miscellaneous/Conceptual/MetalProgrammingGuide/Cmd-Submiss/Cmd-Submiss.html) for device work submission and synchronization.

`examples/add` starts two GPU operations as ordinary worker tasks. `native/tests/client.c` checks real vector results, empty buffers, input limits, thread affinity, retained native context and final cleanup. `native/hardware-qualification.json` records the tested artifact and source identities. Worker isolation does not make foreign code memory safe; the native adapter remains a reviewed trust boundary.

For subsequent releases, dispatch **Build GPU candidate**. Download the measured archive and candidate manifest without rebuilding. Extract the archive into `.aug-build/native/artifact`, copy its measured pins into `aug-package.json`, and run `node native/qualify.mjs COMPILER_DIRECTORY` on an Apple Silicon machine with Metal. Commit the hardware report, source tag and `release-candidates.json` identifying that candidate run. The release workflow verifies that report, the unchanged source inputs and exact archive before publishing. A hosted runner builds artifacts but does not claim GPU execution. The first release was qualified and uploaded from the maintainer machine; later pipeline releases use the recorded candidate run.
