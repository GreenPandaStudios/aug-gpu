#ifndef AUG_GPU_H
#define AUG_GPU_H
#include "aug_native.h"
#define AUG_GPU_EXPORT __attribute__((visibility("default")))
typedef struct aug_gpu_device_v1 aug_gpu_device_v1;
typedef struct aug_gpu_buffer_v1 aug_gpu_buffer_v1;
AUG_GPU_EXPORT int32_t aug_gpu_open_v1(aug_gpu_device_v1 **, aug_native_error_v1 *);
AUG_GPU_EXPORT int32_t aug_gpu_upload_v1(const aug_gpu_device_v1 *, const double *, uint64_t, aug_gpu_buffer_v1 **, aug_native_error_v1 *);
AUG_GPU_EXPORT int32_t aug_gpu_add_v1(const aug_gpu_buffer_v1 *, const aug_gpu_buffer_v1 *, aug_gpu_buffer_v1 **, aug_native_error_v1 *);
AUG_GPU_EXPORT int32_t aug_gpu_download_v1(const aug_gpu_buffer_v1 *, double **, uint64_t *, aug_native_error_v1 *);
AUG_GPU_EXPORT void aug_gpu_device_release_v1(aug_gpu_device_v1 *);
AUG_GPU_EXPORT void aug_gpu_buffer_release_v1(aug_gpu_buffer_v1 *);
AUG_GPU_EXPORT void aug_gpu_values_release_v1(double *);
AUG_GPU_EXPORT int64_t aug_gpu_live_resources_v1(void);
#endif
